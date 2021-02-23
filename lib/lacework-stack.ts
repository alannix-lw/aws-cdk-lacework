import { CfnOutput, Construct, CustomResource, Duration, RemovalPolicy, Stack, StackProps} from '@aws-cdk/core';
import { ArnPrincipal, ManagedPolicy, Policy, PolicyDocument, PolicyStatement, Role } from '@aws-cdk/aws-iam';
import { Trail } from '@aws-cdk/aws-cloudtrail';
import { Bucket, BucketEncryption } from '@aws-cdk/aws-s3';
import { Topic } from '@aws-cdk/aws-sns';
import { SqsSubscription } from '@aws-cdk/aws-sns-subscriptions';
import { Queue } from '@aws-cdk/aws-sqs';
import { StringParameter } from '@aws-cdk/aws-ssm'
import { RetentionDays } from '@aws-cdk/aws-logs';
import { Provider } from '@aws-cdk/custom-resources';
import { PythonFunction } from '@aws-cdk/aws-lambda-python'


export interface LaceworkStackProps extends StackProps {
  enableDatadogIntegration?: boolean
  enableCloudTrailIntegration?: boolean
  enableConfigIntegration?: boolean
  envName?: string
  externalId?: string
  laceworkAwsAccount?: number
}

export class LaceworkStack extends Stack {
  constructor(scope: Construct, id: string, props: LaceworkStackProps) {
    super(scope, id, props);

    const LACEWORK_AWS_ACCOUNT = props?.laceworkAwsAccount || 434813966438
    const externalId = props?.externalId ||
      StringParameter.valueForStringParameter(this, '/lacework/EXTERNAL_ID')

    // IAM Role
    const role = new Role(this, 'LaceworkRole', {
      roleName: 'Lacework',
      assumedBy: new ArnPrincipal(`arn:aws:iam::${LACEWORK_AWS_ACCOUNT}:root`),
      externalIds: [externalId],
    });
    role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('SecurityAudit'))

    // S3 Bucket
    const bucket = new Bucket(this, 'LaceworkBucket', {
      autoDeleteObjects: true,
      encryption: BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // SQS Queue
    const queue = new Queue(this, 'LaceworkQueue', {
      queueName: 'Lacework'
    });

    // SNS Topic
    const topic = new Topic(this, 'LaceworkTopic', {})
    topic.addSubscription(new SqsSubscription(queue))

    // CloudTrail
    new Trail(this, 'LaceworkTrail', {
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
    const customPolicyDocument = PolicyDocument.fromJson(crossAccountPolicyDocument);

    // IAM Cross-account Policy
    const crossAccountPolicy = new Policy(this, 'LaceworkPolicy', {
      document: customPolicyDocument,
    })
    crossAccountPolicy.attachToRole(role)

    // Setup API Integrations (Custom Resource lambda)
    if (props?.enableCloudTrailIntegration || props?.enableConfigIntegration || props?.enableDatadogIntegration) {
      const onEvent = new PythonFunction(this, 'LaceworkApiFn', {
        entry: 'lacework',
        index: 'main.py',
        functionName: 'LaceworkApiHandler',
        timeout: Duration.minutes(2),
        initialPolicy: [
          new PolicyStatement({
            sid: 'GetLaceworkParameters',
            actions: [ 'ssm:Get*' ],
            resources: [
              `arn:aws:ssm:${this.region}:${this.account}:parameter/lacework/*`
            ]
          })
        ],
        environment: {
          DATADOG_INTEGRATION: String(props.enableDatadogIntegration),
          CLOUDTRAIL_INTEGRATION: String(props.enableCloudTrailIntegration),
          CONFIG_INTEGRATION: String(props.enableConfigIntegration),
          ENVIRONMENT: props?.envName || process.env.ENVIRONMENT || 'development',
          ROLE_ARN: role.roleArn,
          QUEUE_URL: queue.queueUrl,
        }
      });

      const laceworkApi = new Provider(this, 'LaceworkApiProvider', {
        onEventHandler: onEvent,
        logRetention: RetentionDays.ONE_DAY // default is INFINITE
      });

      new CustomResource(this, 'LaceworkApi', { serviceToken: laceworkApi.serviceToken });
    }

    // Lacework Output
    new CfnOutput(this, 'IAM Role ARN', { value: role.roleArn });
    new CfnOutput(this, 'SQS Queue URL', { value: queue.queueUrl });
  }
}
