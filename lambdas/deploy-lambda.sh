#!/bin/bash

# Check if the AWS CLI is in the PATH
found=$(which aws)
if [ -z "$found" ]; then
  echo "Please install the AWS CLI under your PATH: http://aws.amazon.com/cli/"
  exit 1
fi

f=$1

cd $f

# Updating Lambda functions
zipCommand="zip -r $f.zip lambda_function.py *.json"

if [ -d "lib" ]; then
  zipCommand+=" lib"
fi

echo "Updating function $f begin..."

echo $zipCommand

eval $zipCommand
aws lambda update-function-code --function-name ${f} --zip-file fileb://${f}.zip --region eu-west-2 --profile camemergency
rm $f.zip
cd ..
echo "Updating function $f end"