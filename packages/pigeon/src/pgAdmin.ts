/*
 * Copyright (c) 2025 Andreas Michael
 * This software is under the Apache 2.0 License
 */

import {Column, PigeonError, Table,} from "./index.js";
import {getJSType, getPGType, getTypesByDataType} from "./utils.js";

function objectToArray(json: string) {
    let arrayJSON = "";
    let enteredObject = false;
    let brackets = 0;
    for (let i = 0; i < json.length; i++) {
        if (json[i] === "{") {
            if (!enteredObject) {
                enteredObject = true;
                arrayJSON += "[";
                brackets++;
                continue;
            }
            brackets++;
            arrayJSON += json[i];
            continue;
        } else if (json[i] === "}") {
            brackets--;
            if (brackets === 0)
                return JSON.parse(arrayJSON.slice(0, -1) + "]");
            arrayJSON += json[i];
            if (brackets === 1)
                arrayJSON += ",";
            continue;
        }
        if (enteredObject && brackets !== 1)
            arrayJSON += json[i];
    }
}

export function getRelationshipsAndTables(json: string) {
    if (!json.startsWith("{\"version\":"))
        throw new PigeonError(1, "", new Error("The file specified is not an pgAdmin ERD file."));
    let relationships = [];
    let tables = [];

    const relationshipsIndex = json.match(/"type":"diagram-links"/)?.index;
    if (relationshipsIndex)
        relationships = objectToArray(json.slice(relationshipsIndex));

    const tablesIndex = json.match(/"type":"diagram-nodes"/)?.index;
    if (tablesIndex)
        tables = objectToArray(json.slice(tablesIndex));

    return {
        relationships: relationships,
        tables: tables,
    };
}

export function tableProcessing(tables: any[]): Table[] {
    const pigeonTables: Table[] = [];
    for (const table of tables) {
        const data = table.otherInfo.data;
        const columns: Column[] = [];
        let ordinalPossition = 1;
        for (const column of data.columns) {
            const types = getTypesByDataType(column.cltype);

            let isNullable = true;
            if (column.attnotnull)
                isNullable = false;

            const jsType = getJSType(types.dataType, types.udtName, isNullable);
            const pgType = getPGType(types.dataType, types.udtName);

            if (column.cltype.includes("serial"))
                column.defval = "nextval('" + data.name + "_" + column.name + "_seq'::regclass)";
            let columnDefault;
            if (column.defval !== "" && column.defval !== undefined)
                columnDefault = column.defval;
            else
                columnDefault = null;

            let identity = false;
            if (column.colconstype === "i")
                identity = true;

            let identityGeneration = null;
            if (identity) {
                if (column.attidentity === "a")
                    identityGeneration = "ALWAYS";
                if (column.attidentity === "b")
                    identityGeneration = "BY DEFAULT";
            }

            let isPrimary = false;
            if (column.name === data.primary_key[0].columns[0].column)
                isPrimary = true;

            let isForeign = false;
            let foreignSchema = undefined;
            let foreignTable = undefined;
            let foreignColumn = undefined;
            for (const foreignKey of data.foreign_key) {
                for (const foreignKeyColumn of foreignKey.columns) {
                    if (foreignKeyColumn.local_column === column.name) {
                        isForeign = true;
                        const match = foreignKeyColumn.references_table_name.match(/(?:\((.*?)\))? ?(.*)/);
                        foreignSchema = match[1] || data.schema;
                        foreignTable = match[2];
                        foreignColumn = foreignKeyColumn.referenced;
                    }
                }
            }

            let isUnique = false;
            if (data.unique_constraint)
                for (const uniqueConstraint of data.unique_constraint)
                    for (const uniqueColumn of uniqueConstraint.columns)
                        if (uniqueColumn.column === column.name)
                            isUnique = true;

            columns.push(new Column(column.name, ordinalPossition, columnDefault, isNullable, jsType, pgType, identity, identityGeneration, isPrimary, isUnique, isForeign, foreignSchema, foreignTable, foreignColumn));
            ordinalPossition++;
        }

        pigeonTables.push(new Table(data.name, data.schema, columns));
    }
    return pigeonTables;
}