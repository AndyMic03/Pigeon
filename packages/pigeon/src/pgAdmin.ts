/*
 * Copyright (c) 2025 Andreas Michael
 * This software is under the Apache 2.0 License
 */

import {ColumnQueryRow, ForeignKeyQueryRow, PigeonError, PrimaryKeyQueryRow, Table, UniqueQueryRow} from "./index.js";
import {udtTypes} from "./maps.js";

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
        const columns: ColumnQueryRow[] = [];
        let ordinalPossition = 1;
        for (const column of data.columns) {
            let dataType: string = column.cltype;
            let udtType: string | undefined;
            udtType = udtTypes.get(dataType);
            if (!udtType) {
                if (dataType.endsWith("[]")) {
                    udtType = "_" + udtTypes.get(dataType.slice(0, -2));
                    dataType = "ARRAY";
                } else {
                    udtType = dataType;
                    dataType = "USER-DEFINED";
                }
            }
            if (dataType === "smallserial" || dataType === "serial" || dataType === "bigserial") {
                dataType = dataType.replace("serial", "int");
                if (dataType === "int")
                    dataType = "integer";
                column.defval = "nextval('" + data.name + "_" + column.name + "_seq'::regclass)";
            }

            let isNullable;
            if (column.attnotnull)
                isNullable = "NO";
            else
                isNullable = "YES";

            let columnDefault;
            if (column.defval !== "" && column.defval !== undefined)
                columnDefault = column.defval;
            else
                columnDefault = null;

            let identity;
            if (column.colconstype === "i")
                identity = "YES";
            else
                identity = "NO";

            let identityGeneration = null;
            if (identity === "YES") {
                if (column.attidentity === "a")
                    identityGeneration = "ALWAYS";
                if (column.attidentity === "b")
                    identityGeneration = "BY DEFAULT";
            }

            columns.push(new ColumnQueryRow(column.name, ordinalPossition, columnDefault, isNullable, dataType, udtType, identity, identityGeneration));
            ordinalPossition++;
        }

        let primaryKey = undefined;
        if (data.primary_key[0]?.columns[0]?.column)
            primaryKey = new PrimaryKeyQueryRow(data.primary_key[0].columns[0].column);

        const foreignKeys: ForeignKeyQueryRow[] = [];
        for (const foreignKey of data.foreign_key) {
            for (const column of foreignKey.columns) {
                const match = column.references_table_name.match(/(?:\((.*?)\))? ?(.*)/);
                foreignKeys.push(new ForeignKeyQueryRow(data.schema, data.name, column.local_column, match[1] || data.schema, match[2], column.referenced));
            }
        }

        const uniqueConstraints: string[] = [];
        if (data.unique_constraint)
            for (const uniqueConstraint of data.unique_constraint)
                for (const column of uniqueConstraint.columns)
                    uniqueConstraints.push(column.column);

        pigeonTables.push(new Table(data.schema, data.name, columns, primaryKey, foreignKeys, new UniqueQueryRow(uniqueConstraints)));
    }
    return pigeonTables;
}