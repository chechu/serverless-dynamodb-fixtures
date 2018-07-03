# serverless-dynamodb-fixtures
Serverless plugin to load data on DynamoDB tables

## Usage

You should include the plugin as dev dependency, and in your serverless.yml file. Then, as a custom variable, you should include a `fixtures` variable with the configuration of the plugin.

The accepted configuration is an array of fixtures, where each fixture has the following variables:
* **table**: (String) Name of the DynamoDB table where you want to load your fixtures.
* **sources**: (Array) List of relative file paths where your data is, in a valid format for the function [batchWrite](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html#batchWrite-property) of [DynamoDB.DocumentClient](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html).
* **rawsources**: (Array) List of relative file paths where your data is, in a valid format for the function [batchWriteItem](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB.html#batchWriteItem-property) of [DynamoDB](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB.html).
* **stage**: (String) Optional. The name of the stage where you want to load these fixtures. If this variable is not set, the fixtures will be loaded for every stage.

**Important**: ``sources`` **or** ``rawsources`` must be defined (at least one of them).

## Examples

### Serverless configuration

```
plugins:
  - serverless-dynamodb-fixtures

custom:
  fixtures:
    - table: TABLE1-${self:custom.stage}
      sources:
        - ./file1-${self:custom.stage}.yml
        - ./file2-${self:custom.stage}.json
      rawsources:
        - ./rawFormatFile1-${self:custom.stage}.yml

    - table: TABLE2-${self:custom.stage}
      [stage: test]
      sources:
        - ./file3-${self:custom.stage}.yml

```

### Fixtures

#### Source in yml format
```
- id: 1
  name: Jack London
- id: 2
  name: John Doe
```

#### Source in json format
```
[
    {"id":1, "name":"Jack London"},
    {"id":2, "name":"John Doe"}
]
```

# Thanks
* How to develop the seeder: https://github.com/99xt/serverless-dynamodb-local
* Original idea: https://github.com/marc-hughes/serverless-dynamodb-fixtures-plugin
