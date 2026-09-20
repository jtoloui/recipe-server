import { Stack, StackProps, CfnOutput, Aws } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface PipelineStackProps extends StackProps {
  /**
   * GitHub "owner/repo" slugs allowed to assume a deploy role, keyed by a short
   * name used in the role id/output. e.g. { server: 'jtoloui/recipe-server' }.
   */
  readonly repos: Record<string, string>;
  /**
   * Git ref allowed to assume the roles. Defaults to the main branch only, so
   * only a workflow running on main (not a fork/PR/other branch) can deploy.
   */
  readonly allowedRef?: string;
  /** CDK bootstrap qualifier (default hnb659fds). */
  readonly bootstrapQualifier?: string;
  /** Regions whose CDK bootstrap roles the deploy role may assume. */
  readonly bootstrapRegions?: string[];
  /** SSM parameter path prefix the roles may read (deploy-time secrets). */
  readonly ssmPathPrefix?: string;
}

/**
 * CI/CD trust plane (deployed ONCE, manually) for GitHub Actions -> AWS via
 * OIDC. No static keys anywhere: GitHub presents a short-lived OIDC token,
 * AWS trusts it through the OIDC provider below, and the workflow assumes a
 * per-repo deploy role scoped to `repo:<owner>/<repo>:ref:refs/heads/main`.
 *
 * Each deploy role can:
 *  - assume the CDK bootstrap roles (deploy / file-publishing / image-publishing
 *    / lookup) in the given regions — this is the CDK-idiomatic grant; the
 *    bootstrap roles already carry the scoped deploy permissions.
 *  - read the deploy-time SSM secrets (googleClientSecret, resendApiKey) that
 *    the API stack needs passed as context at deploy time.
 */
export class PipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const allowedRef = props.allowedRef ?? 'refs/heads/main';
    const qualifier = props.bootstrapQualifier ?? 'hnb659fds';
    const regions = props.bootstrapRegions ?? ['eu-west-2', 'us-east-1'];
    const ssmPathPrefix = props.ssmPathPrefix ?? '/justcooking';

    // Account-global GitHub OIDC provider (one per account). The thumbprint is
    // no longer verified by AWS for token.actions.githubusercontent.com, but
    // the CDK construct still requires the field; this is GitHub's current CA.
    const provider = new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    // Bootstrap roles the deploy role must be able to assume, across regions.
    const bootstrapRoleArns = regions.flatMap((r) => [
      `arn:aws:iam::${Aws.ACCOUNT_ID}:role/cdk-${qualifier}-deploy-role-${Aws.ACCOUNT_ID}-${r}`,
      `arn:aws:iam::${Aws.ACCOUNT_ID}:role/cdk-${qualifier}-file-publishing-role-${Aws.ACCOUNT_ID}-${r}`,
      `arn:aws:iam::${Aws.ACCOUNT_ID}:role/cdk-${qualifier}-image-publishing-role-${Aws.ACCOUNT_ID}-${r}`,
      `arn:aws:iam::${Aws.ACCOUNT_ID}:role/cdk-${qualifier}-lookup-role-${Aws.ACCOUNT_ID}-${r}`,
    ]);

    for (const [name, slug] of Object.entries(props.repos)) {
      const role = new iam.Role(this, `DeployRole${cap(name)}`, {
        roleName: `github-deploy-${name}`,
        description: `GitHub Actions OIDC deploy role for ${slug} (main only)`,
        maxSessionDuration: undefined,
        assumedBy: new iam.OpenIdConnectPrincipal(provider, {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
          StringLike: {
            // Only the main branch of THIS repo may assume the role.
            'token.actions.githubusercontent.com:sub': `repo:${slug}:ref:${allowedRef}`,
          },
        }),
      });

      // Assume the CDK bootstrap roles (the actual deploy permissions live there).
      role.addToPolicy(
        new iam.PolicyStatement({
          sid: 'AssumeCdkBootstrapRoles',
          actions: ['sts:AssumeRole'],
          resources: bootstrapRoleArns,
        }),
      );

      // Read the deploy-time secrets from SSM (SecureString). Region-agnostic
      // ARN pattern under the justcooking path.
      role.addToPolicy(
        new iam.PolicyStatement({
          sid: 'ReadDeploySecrets',
          actions: ['ssm:GetParameter', 'ssm:GetParameters'],
          resources: [
            `arn:aws:ssm:*:${Aws.ACCOUNT_ID}:parameter${ssmPathPrefix}/*`,
          ],
        }),
      );

      new CfnOutput(this, `DeployRoleArn${cap(name)}`, {
        value: role.roleArn,
        description: `Set this as the role-to-assume in ${slug}'s deploy workflow`,
      });
    }

    new CfnOutput(this, 'OidcProviderArn', { value: provider.openIdConnectProviderArn });
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
