import * as cdk from '@aws-cdk/core';
import * as cloudtrail from '@aws-cdk/aws-cloudtrail';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import * as sns from '@aws-cdk/aws-sns';
import * as subs from '@aws-cdk/aws-sns-subscriptions';
import * as sqs from '@aws-cdk/aws-sqs';

interface LaceworkStackProps extends cdk.StackProps {
  laceworkAwsAccount: string
}

export class AwsCdkLaceworkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: LaceworkStackProps) {
    super(scope, id, props);

    const externalId = new cdk.CfnParameter(this, "externalId", {
      type: "String",
      description: "The cross-account access role created by the stack will use this value for its ExternalID."
    });

    // IAM Role
    const role = new iam.Role(this, 'LaceworkRole', {
      assumedBy: new iam.ArnPrincipal(`arn:aws:iam::${props.laceworkAwsAccount}:root`),
      externalIds: [externalId.valueAsString],
    });
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('SecurityAudit'))

    // S3 Bucket
    const bucket = new s3.Bucket(this, 'LaceworkBucket', {
      autoDeleteObjects: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // SQS Queue
    const queue = new sqs.Queue(this, 'LaceworkQueue', {});

    // SNS Topic
    const topic = new sns.Topic(this, 'LaceworkTopic', {})
    topic.addSubscription(new subs.SqsSubscription(queue))

    // CloudTrail
    const trail = new cloudtrail.Trail(this, 'LaceworkTrail', {
      bucket: bucket,
      snsTopic: topic,
    });

    // IAM Cross-account Policy Document
    const crossAccountPolicyDocument = {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Sid": "ReadLogFiles",
          "Effect": "Allow",
          "Action": "s3:Get*",
          "Resource": `arn:aws:s3:::${bucket.bucketName}/*`
        },
        {
          "Sid": "GetAccountAlias",
          "Effect": "Allow",
          "Action": "iam:ListAccountAliases",
          "Resource": "*"
        },
        {
          "Sid": "ListLogFiles",
          "Effect": "Allow",
          "Action": "s3:ListBucket",
          "Resource": bucket.bucketArn,
          "Condition": {
            "StringLike": {
              "s3:prefix": "*AWSLogs/"
            }
          }
        },
        {
          "Sid": "ConsumeNotifications",
          "Effect": "Allow",
          "Action": [
            "sqs:ReceiveMessage",
            "sqs:GetQueueUrl",
            "sqs:GetQueueAttributes",
            "sqs:DeleteMessage"
          ],
          "Resource": queue.queueArn
        },
        {
          "Sid": "Debug",
          "Effect": "Allow",
          "Action": [
            "sns:ListTopics",
            "sns:ListSubscriptionsByTopic",
            "sns:ListSubscriptions",
            "sns:GetTopicAttributes",
            "sns:GetSubscriptionAttributes",
            "s3:ListAllMyBuckets",
            "s3:GetBucketPolicy",
            "s3:GetBucketLogging",
            "s3:GetBucketLocation",
            "s3:GetBucketAcl",
            "cloudtrail:ListPublicKeys",
            "cloudtrail:GetTrailStatus",
            "cloudtrail:GetTrail",
            "cloudtrail:DescribeTrails"
          ],
          "Resource": "*"
        }
      ]
    }
    const customPolicyDocument = iam.PolicyDocument.fromJson(crossAccountPolicyDocument);

    // IAM Cross-account Policy
    const crossAccountPolicy = new iam.Policy(this, 'LaceworkPolicy', {
      document: customPolicyDocument,
    })
    crossAccountPolicy.attachToRole(role)

    // Lacework Output
    new cdk.CfnOutput(this, 'External ID', { value: externalId.valueAsString });
    new cdk.CfnOutput(this, 'IAM Role ARN', { value: role.roleArn });
    new cdk.CfnOutput(this, 'SQS Queue URL', { value: queue.queueUrl });
  }
}
