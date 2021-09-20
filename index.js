const commandLineArgs = require('command-line-args')
const fs = require('fs');
const lineReader = require('line-reader');
const { exec } = require("child_process");
const cliProgress = require('cli-progress');

const tables = {};

const optionDefinitions = [
    { name: 'verbose', alias: 'v', type: Boolean },
    { name: 'src', type: String, defaultOption: true },
    { name: 'move-constraints', type: Boolean},
    { name: 'skip-data', type: String, multiple: true},
    { name: 'outfile', type: String },
    { name: 'stdout', type: Boolean },
]

const options = commandLineArgs(optionDefinitions)
let outfile = false;
if (options.outfile) {
    outfile = fs.createWriteStream(options.outfile);
}
options['skip-data'] = options['skip-data'] || [];

let totalLineCount = 0;
let currentLineCount = 0;
let status = false;
let currentTable = '';
let previousLine = null;
let writeLine = true;

const bar1 = new cliProgress.SingleBar({
    format: '{name} [{bar}] {percentage}% | ETA: {eta}s | {value}/{total}'
}, cliProgress.Presets.shades_classic);

exec(`wc -l ${options.src} | cut -d' ' -f 1`, (err, stdout, stderr) => {
    if (err || stderr) {
        console.error(err || stderr);
        process.exit(1)
    }
    totalLineCount = parseInt(stdout);
    bar1.start(totalLineCount, 0);


    lineReader.eachLine(options.src, function(line, last) {
        writeLine = true;
        let checkLine = line.trim();
        if (checkLine.indexOf('CREATE TABLE') === 0) {
            let name = checkLine.replace('CREATE TABLE ', '').replace(' (', '');
            status = 'CREATE_TABLE';
            currentTable = name;
            tables[name] = {
                name: name,
                constraints: [],
                dataLines: 0
            };
        } else if (checkLine.indexOf('COPY ') === 0) {
            let [,tableName] = checkLine.split(' ')
            if (options['skip-data'].indexOf(tableName) > -1) {
                line = null;
            }
            currentTable = tableName;
            status = 'COPY_DATA';
        } else if (checkLine === '\.') {
            if (options['skip-data'] && options['skip-data'].indexOf(currentTable) > -1) {
                line = null;
            }
            status = false;
            currentTable = ''
        } else if (checkLine.indexOf('CONSTRAINT ') === 0) {
            if (status === 'CREATE_TABLE' && currentTable && options['move-constraints']) {
                if (previousLine && previousLine.trim().indexOf('CONSTRAINT ') === -1) {
                    // Previous line needs to have the trailing comma removed
                    previousLine = previousLine.slice(0, -1);
                }
                line = null;
            }
            tables[currentTable].constraints.push(checkLine);
        }
        else {
            if (status === 'COPY_DATA' && currentTable) {
                tables[currentTable].dataLines++;
                if (options['skip-data'].indexOf(currentTable) > -1) {
                    line = null;
                }
            }

        }
        bar1.update(currentLineCount, {name: currentTable || 'Progress'});
        if(last) {
            bar1.stop();
        }
        if ((previousLine !== null && writeLine) || last) {
            writeOutputLine(previousLine)
            if (last) {

                // Add back the constraints
                if (options['move-constraints']) {
                    for (let key in tables) {
                        const constraints = tables[key].constraints.map(c => `ALTER TABLE ${tables[key].name} ADD ${c.replace(/,$/, '')};`).join("\n");
                        if (constraints) {
                            writeOutputLine(constraints)
                        }

                    }
                }
                writeOutputLine(line, true);
            }
        }
        previousLine = line;

        currentLineCount++;

    });

})



function writeOutputLine(line, end = false) {
    if (outfile) {
        if (end) {
            outfile.end(line + "\n")
        } else {
            outfile.write(line + "\n")
        }

    }
    if (options.stdout) {
        console.log(line)
    }

}

