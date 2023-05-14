export interface ValidateError {
	errors: Errors;
	_message: string;
	name: string;
	message: string;
}
export interface Errors {
	[key: string]: ErrorKey;
}
export interface ErrorKey {
	name: string;
	message: string;
	properties: Properties;
	kind: string;
	path: string;
}
export interface Properties {
	message: string;
	type: string;
	path: string;
}
