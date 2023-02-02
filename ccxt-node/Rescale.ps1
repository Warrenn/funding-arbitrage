param (
    $AwsProfile = "busyweb-admin",
    [String]
    $Region = "af-south-1",
    [Switch]
    $Redeploy
)

if ($Redeploy) {
    & tsc --build ./tsconfig.json
    Get-ChildItem -Path .\package.json, .\package-lock.json, .\out, .\src |
    Compress-Archive -DestinationPath ./ccxt-node-application.zip -CompressionLevel Optimal -Force
    aws s3 cp ./ccxt-node-application.zip s3://secure-artifacts-93648082bbed41458cac8d7814803d3c/ccxt-node/ccxt-node-application.zip --profile $AwsProfile --region $Region
}

$scalingGroup=$(aws cloudformation describe-stacks --stack-name "ccxt-node-stack" --query "Stacks[0].Outputs[?OutputKey=='ScalingGroup'].OutputValue | [0]"  --profile $AwsProfile --region $Region)
iex "aws autoscaling set-desired-capacity --auto-scaling-group-name $scalingGroup --desired-capacity 0  --profile $AwsProfile --region $Region"
Start-Sleep 3
iex "aws autoscaling set-desired-capacity --auto-scaling-group-name $scalingGroup --desired-capacity 1  --profile $AwsProfile --region $Region"