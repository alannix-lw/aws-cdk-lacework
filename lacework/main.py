from laceworksdk import LaceworkClient
import boto3
import os

# Integration Types (https://<myaccount>.lacework.net/api/v1/external/docs)
#   AWS_CT_SQS - Amazon Web Services (AWS) Cloud Trail
#   AWS_CFG - Amazon Web Services (AWS) Compliance
#   DATADOG - Datadog


def handler(event, context):
  ssm_client = boto3.client('ssm')
  lacework_client = get_lacework_client(ssm_client)

  request_type = event['RequestType']
  if request_type == 'Create':
    return on_create(ssm_client, lacework_client)
  elif request_type == 'Delete':
    return on_delete(lacework_client)
  else:
    raise Exception("Invalid request type: %s" % request_type)


def on_create(ssm_client, lacework_client):
  environment = os.environ['ENVIRONMENT']
  external_id = ssm_client.get_parameter(
      Name='/lacework/EXTERNAL_ID'
  )['Parameter']['Value']

  if os.environ['CONFIG_INTEGRATION'] == 'true':
    print("Started creating AWS Config integration")
    lacework_client.integrations.create(
      name=f"Config-{environment}",
      type='AWS_CFG',
      enabled=1,
      data={
        "CROSS_ACCOUNT_CREDENTIALS": {
          "EXTERNAL_ID": external_id,
          "ROLE_ARN": os.environ['ROLE_ARN']
        }
      }
    )
    print("Finished creating AWS Config integration")

  if os.environ['CLOUDTRAIL_INTEGRATION'] == 'true':
    print("Started creating AWS CloudTrail integration")
    lacework_client.integrations.create(
      name=f"CloudTrail-{environment}",
      type='AWS_CT_SQS',
      enabled=1,
      data={
        "CROSS_ACCOUNT_CREDENTIALS": {
          "EXTERNAL_ID": external_id,
          "ROLE_ARN": os.environ['ROLE_ARN']
        },
        "QUEUE_URL": os.environ['QUEUE_URL']
      }
    )
    print("Finished creating AWS CloudTrail integration")


def on_delete(lacework_client):
  integrations = lacework_client.integrations.get()['data']
  for integration in integrations:
    if integration['TYPE'] in ('AWS_CT_SQS', 'AWS_CFG', 'DATADOG'):
      print(f"Started deleting integration {integration['NAME']}")
      lacework_client.integrations.delete(integration['INTG_GUID'])
      print(f"Finished deleting integration {integration['NAME']}")


def get_lacework_client(ssm_client):
  os.environ['LW_ACCOUNT'] = ssm_client.get_parameter(
    Name='/lacework/LW_ACCOUNT'
  )['Parameter']['Value']

  os.environ['LW_API_KEY'] = ssm_client.get_parameter(
      Name='/lacework/LW_API_KEY',
      WithDecryption=True
  )['Parameter']['Value']

  os.environ['LW_API_SECRET'] = ssm_client.get_parameter(
      Name='/lacework/LW_API_SECRET',
      WithDecryption=True
  )['Parameter']['Value']

  return LaceworkClient()
