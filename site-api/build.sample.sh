#!/bin/bash

DEPLOY_DIR=/deploy-dir/

npm run build
cp -r ./* $DEPLOY_DIR
cp ./config.rls.properties $DEPLOY_DIR/config.properties