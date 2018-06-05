#!/bin/bash

MYDIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd $MYDIR

while true; do
    DEBUG=*matrix-puppet:* node index.js
    sleep 1
done
