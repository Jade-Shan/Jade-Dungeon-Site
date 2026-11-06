#!/bin/bash

DEPLOY_DIR=/deploy-dir/

npm run build
cp -r ./dist          $DEPLOY_DIR
# cp -r ./node_modules  $DEPLOY_DIR
cp -r ./static        $DEPLOY_DIR
cp ./start.sh         $DEPLOY_DIR
cp ./config.rls.properties $DEPLOY_DIR/config.properties
