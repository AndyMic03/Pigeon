/*
 * Copyright (c) 2025 Andreas Michael
 * This software is under the Apache 2.0 License
 */

import pg from "pg";
import {jsTypes, udtTypes} from "./maps.js";
import {Column, Database} from "./index.js";

const {Client} = pg;

export async function runQuery(command: string, parameters: any[], db: Database): Promise<any | undefined> {
    const client = new Client({
        host: db.host,
        port: Number(db.port),
        database: db.db,
        user: db.user,
        password: db.pass,
    });
    try {
        await client.connect();
        return await client.query(command, parameters);
    } catch (error: any) {
        consoleMessage("ERR", error.toString());
        return undefined;
    } finally {
        await client.end();
    }
}

export function consoleMessage(level: string, message: string) {
    let color;
    switch (level) {
        case 'DBG':
            color = "\x1b[96m";
            break;
        case 'INF':
            color = "\x1b[92m";
            break;
        case 'WRN':
            color = "\x1b[33m";
            break;
        case 'ERR':
            color = "\x1b[91m";
            break;
        case 'CRT':
            color = "\x1b[31m";
            break;
        default:
            color = "\x1b[0m";
    }
    console.log(new Date(Date.now()).toISOString() + " " + color + level + "\x1b[0m " + message);
}

export function sleep(milliseconds: number) {
    const start = new Date().getTime();
    for (let i = 0; i < 1e7; i++) {
        if ((new Date().getTime() - start) > milliseconds) {
            break;
        }
    }
}

export function nameBeautifier(name: string) {
    const words = name.split("_");
    let out = "";
    for (let word of words) {
        word = word[0].toUpperCase() + word.substring(1);
        if (word === "Id")
            word = "ID";
        out += word + " ";
    }
    return out.slice(0, -1);
}

export function tabsInserter(tabNumber: number): string {
    let tabs: string = "";
    for (let i = 0; i < tabNumber; i++)
        tabs += "\t";
    return tabs;
}

export function arrayMaker(baseTabs: number, variableName: string, className: string, columns: Column[]): string {
    let array: string = "";
    array += tabsInserter(baseTabs) + "let " + variableName + ": " + className + "[] = [];\n";
    array += tabsInserter(baseTabs) + "for (const row of " + variableName + "Query.rows)\n";
    array += tabsInserter(baseTabs + 1) + variableName + ".push(new " + className + "(\n";
    for (const column of columns)
        array += tabsInserter(baseTabs + 2) + "row." + column.name + ",\n";
    array = array.slice(0, -2) + "\n";
    array += tabsInserter(baseTabs + 1) + "));";
    return array;
}

export function singularize(word: string) {
    const endings: { [key: string]: string } = {
        ves: "fe",
        ies: "y",
        i: "us",
        zes: "ze",
        ses: "s",
        es: "e",
        s: ""
    };
    return word.replace(
        new RegExp(`(${Object.keys(endings).join('|')})$`),
        r => endings[r]
    );
}

export function getJSType(dataType: string, udtName: string, isNullable: boolean): string {
    dataType = dataType.replace("serial", "int");
    if (dataType === "int")
        dataType = "integer";
    let isArray = false;
    if (dataType === "ARRAY") {
        dataType = udtName.slice(1);
        isArray = true;
    }
    let foundDataType = jsTypes.get(dataType);
    if (foundDataType === undefined)
        foundDataType = nameBeautifier(udtName).replaceAll(" ", "");
    if (isArray)
        foundDataType += "[]";
    if (isNullable)
        foundDataType += " | null";
    return foundDataType;
}

export function getTypesByDataType(dataType: string): { dataType: string; udtName: string } {
    let udtName: string | undefined;
    udtName = udtTypes.get(dataType);

    if (!udtName) {
        if (dataType.endsWith("[]")) {
            udtName = "_" + udtTypes.get(dataType.slice(0, -2));
            dataType = "ARRAY";
        } else {
            udtName = dataType;
            dataType = "USER-DEFINED";
        }
    }
    return {
        dataType: dataType,
        udtName: udtName
    };
}

export function getPGType(dataType: string, udtName?: string): string {
    if (!udtName) {
        const types = getTypesByDataType(dataType);
        udtName = types.udtName;
    }
    dataType = dataType.replace("serial", "int");
    if (dataType === "int")
        dataType = "integer";
    let pgType = udtName;
    if (dataType.endsWith("[]") || dataType === "ARRAY")
        pgType = (udtTypes.get(pgType.slice(1)) || pgType.slice(1)) + "[]";
    else if (dataType !== "USER-DEFINED")
        pgType = dataType;
    return pgType;
}