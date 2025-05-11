#!/usr/bin/env node

/*
 * Copyright (c) 2025 Andreas Michael
 * This software is under the Apache 2.0 License
 */

import {cli, run} from "../src/cli.js";
import {PigeonError} from "../src/index.js";

try {
    const result = await run(cli.flags);
    if (result instanceof PigeonError) {
        if (result.message !== "")
            console.log(result.message);
        console.error(result.error);
        process.exit(result.exitCode);
    } else {
        console.log("Generation Completed Successfully");
        process.exit(0);
    }
} catch (error) {
    console.error(error);
    process.exit(2);
}