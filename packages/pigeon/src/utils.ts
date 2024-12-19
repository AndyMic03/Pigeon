/*
 * Copyright (c) 2024 Andreas Michael
 * This software is under the Apache 2.0 License
 */

import pg from 'pg';

const {Client} = pg;

export async function runQuery(command: string, parameters: any[], host: string, port: number, db: string, username: string, password: string): Promise<any | undefined> {
    const client = new Client({
        host: host,
        port: port,
        database: db,
        user: username,
        password: password,
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

export function queryMaker(baseTabs: number, variableName: string, command: string, parameters: string): string {
    let query: string = "";
    query += tabsInserter(baseTabs) + "let " + variableName + "Query;\n";
    query += tabsInserter(baseTabs) + "try {\n";
    query += tabsInserter(baseTabs + 1) + "await client.connect();\n";
    query += tabsInserter(baseTabs + 1) + variableName + "Query = await client.query(`\n";
    query += tabsInserter(baseTabs + 2) + command + "\n";
    query += tabsInserter(baseTabs + 1) + "`, [" + parameters + "]);\n";
    query += tabsInserter(baseTabs) + "} catch (error: any) {\n";
    query += tabsInserter(baseTabs + 1) + "throw error;\n";
    query += tabsInserter(baseTabs) + "} finally {\n";
    query += tabsInserter(baseTabs + 1) + "await client.end();\n";
    query += tabsInserter(baseTabs) + "}";
    return query;
}

export function arrayMaker(baseTabs: number, variableName: string, className: string, columns: any[]): string {
    let array: string = "";
    array += tabsInserter(baseTabs) + "let " + variableName + ": " + className + "[] = [];\n";
    array += tabsInserter(baseTabs) + "for (const row of " + variableName + "Query.rows)\n";
    array += tabsInserter(baseTabs + 1) + variableName + ".push(new " + className + "(\n";
    for (const column of columns)
        array += tabsInserter(baseTabs + 2) + "row." + column.column_name + ",\n";
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

export function getCombinations(valuesArray: string[]): string[][] {
    let combinations: string[][] = [];
    let temp: string[] = [];
    let possibleCombinations = Math.pow(2, valuesArray.length);

    for (let i = 0; i < possibleCombinations; i++) {
        temp = [];
        for (let j = 0; j < valuesArray.length; j++)
            if ((i & Math.pow(2, j)))
                temp.push(valuesArray[j]);

        if (temp.length > 0)
            combinations.push(temp);
    }

    combinations.sort((a, b) => a.length - b.length);
    return combinations;
}