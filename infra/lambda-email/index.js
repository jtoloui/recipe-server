const b64 = require('base64-js');
const encryptionSdk = require('@aws-crypto/client-node');

// Configure the encryption SDK client with the KMS key from the environment variables.

const { encrypt, decrypt } = encryptionSdk.buildClient(encryptionSdk.CommitmentPolicy.REQUIRE_ENCRYPT_ALLOW_DECRYPT);
const generatorKeyId = process.env.KEY_ALIAS;
const keyIds = [process.env.KEY_ARN];
const keyring = new encryptionSdk.KmsKeyringNode({ generatorKeyId, keyIds })

const KNOWN_CODE_TRIGGERS = [
  'CustomEmailSender_SignUp',
  'CustomEmailSender_ResendCode',
  'CustomEmailSender_ForgotPassword',
  'CustomEmailSender_UpdateUserAttribute',
  'CustomEmailSender_VerifyUserAttribute',
  'CustomEmailSender_AdminCreateUser',
  'CustomEmailSender_AccountTakeOverNotification',
];

const sendEmail = async (to, subject, message) => {
  /*global fetch*/
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'JustCooking <no-reply@justcook.ing>',
      to: [to],
      subject: subject,
      html: message
    }),
  });

  if (res.ok) {
    const data = await res.json();

    return {
      statusCode: 200,
      body: data,
    };
  }
}



exports.handler = async (event) => {

  console.log("event", event)
  let plainTextCode;
  if (event.request.code) {
    // Decrypt the secret code using encryption SDK
    const { plaintext } = await decrypt(keyring, b64.toByteArray(event.request.code));
    plainTextCode = plaintext
  }
  const email = event.request.userAttributes.email

  // PlainTextCode now has the decrypted secret.

  // Determine the action based on the trigger source and log the decrypted code.
  let message;
  let subject;

  switch (event.triggerSource) {
    case 'CustomEmailSender_SignUp':
      message = `<p>Welcome to JustCooking! Your verification code is: <b>${plainTextCode}</b></p>`;
      subject = 'JustCooking - Signup Verification Code';
      await sendEmail(email, subject, message);
      break;
    case 'CustomEmailSender_ResendCode':
      message = `<p>Your verification code is: <b>${plainTextCode}</b></p>`;
      subject = "JustCooking -  Verification Code";
      await sendEmail(email, subject, message);
      break;
    case 'CustomEmailSender_ForgotPassword':
      console.log("CustomEmailSender_ForgotPassword: " + plainTextCode);
      message = `<p>Your verification code is: <b>${plainTextCode}</b>. <br>This code is valid for 1 hour.</p>`;
      subject = 'JustCooking -  Forgotten Password Verification Code';
      await sendEmail(email, subject, message);
      break;
    case 'CustomEmailSender_UpdateUserAttribute':
      console.log("CustomEmailSender_UpdateUserAttribute: " + plainTextCode);
      break;
    case 'CustomEmailSender_VerifyUserAttribute':
      console.log("CustomEmailSender_VerifyUserAttribute: " + plainTextCode);
      break;
    case 'CustomEmailSender_AdminCreateUser':
      console.log("CustomEmailSender_AdminCreateUser: " + plainTextCode);
      break;
    case 'CustomEmailSender_AccountTakeOverNotification':
      console.log("CustomEmailSender_AccountTakeOverNotification: " + plainTextCode);
      break;
    case 'PostConfirmation_ConfirmSignUp':
      message = `<p>Welcome to JustCooking! A place where you can get straight into cooking as share with your friends and family</p>`;
      subject = 'Welcome to JustCooking';
      await sendEmail(email, subject, message);
      return event;
    case 'PostConfirmation_ConfirmForgotPassword':
      message = `<p>You have succesfully updated your password.</p>`;
      subject = 'JustCooking - Password Reset';
      await sendEmail(email, subject, message)
      return event;
    default:
      break;
  }
return ;
};