const csv = require('csv-stringify');
const iconv = require('iconv-lite');

const mondayUtils = require('./monday.js');
const databaseUtils = require('./database.js');

const ignoredTypes = ['name', 'subtasks', 'formula', 'columns-battery'];
const dismembererTypes = require('./dismemberer.js');
const dismembererNoop = {};

function formatHeader(columns, dismemberer) {
    const header = [
        'Title',
        'Updated At',
        'Group'
    ];

    columns.forEach(c => {
        const title = c['title'];
        const type = c['type'];

        if (ignoredTypes.indexOf(type) !== -1) return;

        header.push(title);

        if (dismemberer[type]) {
            dismemberer[type].column_suffixes.forEach(s => header.push(title + ' ' + s));
        }
    });

    return header;
}

function formatItems(items, dismemberer) {
    return items.map(item => {
        const data = [
            item['name'],
            item['updated_at'],
            item['group']['title']
        ];

        item['column_values'].forEach(c => {
            const type = c['type'];

            if (ignoredTypes.indexOf(type) !== -1) return;

            data.push(c['text']);

            if (dismemberer[type]) {
                dismemberer[type].process(c, data);
            }
        });

        return data;
    });
}

function formatData(data, dismemberer) {
    const boardObj = data['data']['boards'][0];

    const columns = boardObj['columns'];
    const items = boardObj['items'];

    return [
        formatHeader(columns, dismemberer),
        ...formatItems(items, dismemberer)
    ];
}

function writeCsv(data, res) {
    res.headers = {
        'Content-Type': 'text/csv; charset=windows-1252',
    };

    const stream = iconv.encodeStream('win-1252');

    stream.pipe(res);

    csv(data, {delimiter: ','}, (err, output) => {
        stream.end(output);
    });
}


module.exports = async function(db, req, res) {
    let key, board;
    let token = req.query.token;
    let dismember = req.query.dismember;

    try {

        if (token) {
            const result = await databaseUtils.fromToken(db, token);

            if (!result) {
                // Invalid token
                res.statusCode = 401;
                res.end('Invalid token');
                return;
            }

            key = result.key;
            board = result.board;
        } else {
            key = req.query.key;
            board = req.query.board;
        }

        if (!key || !board) {
            // Invalid key or board
            res.statusCode = 401;
            res.end('Blank API key or Board ID');
            return;
        }

        const data = await mondayUtils.retrieveItems(key, board);
        const formated = formatData(data, dismember ? dismembererTypes : dismembererNoop);

        writeCsv(formated, res);
    } catch(err) {
        res.statusCode = 500;
        res.end(err);
    }
};