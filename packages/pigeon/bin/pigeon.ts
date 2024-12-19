#!/usr/bin/env node

/*
 * Copyright (c) 2024 Andreas Michael
 * This software is under the Apache 2.0 License
 */

import {cli, run} from "../src/cli.js";

try {
    const {exitCode, message, error} = await run(cli.flags);
    if (message) {
        console.log(message);
    }
    if (error) {
        console.error(error);
    }
    process.exit(exitCode);
} catch (error) {
    console.error(error);
    process.exit(2);
}