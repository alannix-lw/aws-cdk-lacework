#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { AwsCdkLaceworkStack } from '../lib/aws-cdk-lacework-stack';

export const LACEWORK_AWS_ACCOUNT = '434813966438';

const app = new cdk.App();
new AwsCdkLaceworkStack(app, 'AwsCdkLaceworkStack', {
    laceworkAwsAccount: LACEWORK_AWS_ACCOUNT
});
