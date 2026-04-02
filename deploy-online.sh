#!/bin/bash

# Configuration
PROJECT_ID="gen-lang-client-0665993045"
SERVICE_NAME="mecheng-manager"
REGION="europe-west2"

echo "----------------------------------------------------"
echo "Deploying Mecheng Manager to Google Cloud Run..."
echo "----------------------------------------------------"

# Ensure gcloud is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q "@"; then
    echo "ERROR: Please login first using 'gcloud auth login'"
    exit 1
fi

# Set the correct project
gcloud config set project $PROJECT_ID

# Build and deploy to Cloud Run
# Using --source . allows gcloud to handle the build via Cloud Build
gcloud run deploy $SERVICE_NAME \
    --source . \
    --region $REGION \
    --allow-unauthenticated \
    --port 3000 \
    --env-vars-file .env

echo "----------------------------------------------------"
echo "Deployment Complete!"
echo "----------------------------------------------------"
