# AWS CDK Lacework Integration

This is an example of how to create the necessary AWS resources for integrating with Lacework for Configuration and CloudTrail analysis - using the AWS CDK.

## Build

To build this app, you need to be in this example's root folder. Then run the following:

```bash
npm install -g aws-cdk
npm install
npm run build
```

This will install the AWS CDK, then this example's dependencies, and then build your TypeScript files and your CloudFormation template.

## Deploy

Run `cdk deploy`. This will deploy / redeploy your Stack to your AWS Account.

This will also deploy a Lambda function to notify a Lacework account when the integration has been completed.
