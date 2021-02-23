import{ App } from '@aws-cdk/core'
import { LaceworkStack } from '../lib/lacework-stack'

const app = new App();
new LaceworkStack(app, 'LaceworkStack', {
  enableCloudTrailIntegration: true,
  enableConfigIntegration: true,
  envName: process.env.ENVIRONMENT
})
