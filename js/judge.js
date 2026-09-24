/* Mini Judge — Wandbox API client with OJ-style output comparison */
(function () {
    'use strict';

    var API_URL = 'https://wandbox.org/api/compile.json';
    var REQUEST_GAP_MS = 400;
    var MAX_DIFF_LINES = 100;

    var COMPILERS = {
        'c++': { compiler: 'gcc-13.2.0', options: 'warning,gnu++2a' },
        'c': { compiler: 'gcc-13.2.0-c', options: 'warning,gnu11' }
    };

    var SAMPLE_CODE = [
        '#include <bits/stdc++.h>',
        'using namespace std;',
        '',
        'int main() {',
        '    long long a, b;',
        '    cin >> a >> b;',
        '    cout << a + b << "\\n";',
        '    return 0;',
        '}'
    ].join('\n');

    // ----- Editor -----
    var editor = CodeMirror.fromTextArea(document.getElementById('codeInput'), {
        mode: 'text/x-c++src',
        theme: 'dracula',
        lineNumbers: true,
        indentUnit: 4,
        tabSize: 4,
        indentWithTabs: false,
        matchBrackets: true
    });
    editor.setValue(SAMPLE_CODE);

    var langSelect = document.getElementById('langSelect');
    langSelect.addEventListener('change', function () {
        editor.setOption('mode', langSelect.value === 'c' ? 'text/x-csrc' : 'text/x-c++src');
    });

    // ----- Test cases -----
    var testsBody = document.getElementById('testsBody');
    var nextId = 1;

    function addTest(input, expected) {
        var card = document.createElement('div');
        card.className = 'test-card';
        card.dataset.id = nextId++;

        var head = document.createElement('div');
        head.className = 'test-head';

        var label = document.createElement('span');
        label.className = 'test-label';

        var verdict = document.createElement('span');
        verdict.className = 'verdict';
        verdict.textContent = '--';

        var remove = document.createElement('button');
        remove.className = 'test-remove';
        remove.textContent = 'X';
        remove.addEventListener('click', function () {
            card.remove();
            renumber();
        });

        head.appendChild(label);
        head.appendChild(verdict);
        head.appendChild(remove);

        var io = document.createElement('div');
        io.className = 'test-io';

        var inCol = document.createElement('div');
        var inTitle = document.createElement('div');
        inTitle.className = 'io-title';
        inTitle.textContent = 'INPUT';
        var inArea = document.createElement('textarea');
        inArea.className = 'io-area input';
        inArea.spellcheck = false;
        inArea.value = input || '';
        inCol.appendChild(inTitle);
        inCol.appendChild(inArea);

        var outCol = document.createElement('div');
        var outTitle = document.createElement('div');
        outTitle.className = 'io-title';
        outTitle.textContent = 'EXPECTED';
        var outArea = document.createElement('textarea');
        outArea.className = 'io-area expected';
        outArea.spellcheck = false;
        outArea.value = expected || '';
        outCol.appendChild(outTitle);
        outCol.appendChild(outArea);

        io.appendChild(inCol);
        io.appendChild(outCol);

        var gotCol = document.createElement('div');
        gotCol.className = 'io-col out-col';
        var gotTitle = document.createElement('div');
        gotTitle.className = 'io-title';
        gotTitle.textContent = 'OUTPUT';
        var gotArea = document.createElement('textarea');
        gotArea.className = 'io-area output';
        gotArea.spellcheck = false;
        gotArea.readOnly = true;
        gotArea.placeholder = '(run to see output)';
        gotCol.appendChild(gotTitle);
        gotCol.appendChild(gotArea);
        io.appendChild(gotCol);

        card.appendChild(head);
        card.appendChild(io);
        testsBody.appendChild(card);
        renumber();
    }

    function renumber() {
        var cards = testsBody.querySelectorAll('.test-card');
        cards.forEach(function (card, i) {
            card.querySelector('.test-label').textContent = 'TEST #' + (i + 1);
        });
    }

    document.getElementById('addTestBtn').addEventListener('click', function () {
        addTest('', '');
    });

    addTest('1 2', '3');
    addTest('1000000000 2000000000', '3000000000');

    // ----- Result log -----
    var resultBody = document.getElementById('resultBody');
    var detailList = document.getElementById('detailList');

    function log(text, cls) {
        var line = document.createElement('div');
        line.className = 'log-line' + (cls ? ' ' + cls : '');
        line.textContent = '> ' + text;
        resultBody.appendChild(line);
        resultBody.scrollTop = resultBody.scrollHeight;
    }

    function clearResults() {
        resultBody.innerHTML = '';
        detailList.innerHTML = '';
    }

    // ----- OJ-style comparison -----
    function normalizeLines(s) {
        var lines = s.replace(/\r\n?/g, '\n').split('\n').map(function (l) {
            return l.replace(/[ \t]+$/, '');
        });
        while (lines.length && lines[lines.length - 1] === '') lines.pop();
        return lines;
    }

    function compare(expected, actual) {
        var exp = normalizeLines(expected);
        var act = normalizeLines(actual);
        var n = Math.max(exp.length, act.length);
        for (var i = 0; i < n; i++) {
            if ((exp[i] || '') !== (act[i] || '')) {
                return { ok: false, firstDiff: i, exp: exp, act: act };
            }
        }
        return { ok: true, exp: exp, act: act };
    }

    // ----- Wandbox -----
    function execute(code, language, stdin) {
        var cfg = COMPILERS[language];
        return fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: code,
                compiler: cfg.compiler,
                options: cfg.options,
                stdin: stdin
            })
        }).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status + (res.status === 429 ? ' (rate limited, try again in a moment)' : ''));
            return res.json();
        });
    }

    function sleep(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    // ----- Detail rendering -----
    function setVerdict(card, text, cls) {
        var v = card.querySelector('.verdict');
        v.textContent = text;
        v.className = 'verdict ' + cls;
    }

    function renderDetail(idx, title, cls, buildBody) {
        var card = document.createElement('div');
        card.className = 'detail-card';

        var head = document.createElement('div');
        head.className = 'detail-head';
        var name = document.createElement('span');
        name.textContent = 'TEST #' + (idx + 1);
        var verdict = document.createElement('span');
        verdict.className = 'verdict ' + cls;
        verdict.textContent = title;
        head.appendChild(name);
        head.appendChild(verdict);

        var body = document.createElement('div');
        body.className = 'detail-body';
        buildBody(body);

        card.appendChild(head);
        card.appendChild(body);
        detailList.appendChild(card);
    }

    function renderPre(body, text) {
        var pre = document.createElement('pre');
        pre.textContent = text || '(empty)';
        body.appendChild(pre);
    }

    function renderDiff(body, cmp) {
        var table = document.createElement('table');
        table.className = 'diff-table';
        var n = Math.min(Math.max(cmp.exp.length, cmp.act.length), MAX_DIFF_LINES);
        for (var i = 0; i < n; i++) {
            var e = i < cmp.exp.length ? cmp.exp[i] : '<missing>';
            var a = i < cmp.act.length ? cmp.act[i] : '<missing>';
            var match = e === a && e !== '<missing>';
            var row = document.createElement('tr');
            row.className = 'diff-row' + (match ? '' : ' mismatch');

            var num = document.createElement('td');
            num.className = 'd-num';
            num.textContent = i + 1;
            var mark = document.createElement('td');
            mark.className = 'd-mark';
            mark.textContent = match ? '=' : '!=';
            var expTd = document.createElement('td');
            expTd.className = 'd-exp';
            expTd.textContent = e;
            var gotTd = document.createElement('td');
            gotTd.className = 'd-got';
            gotTd.textContent = a;

            row.appendChild(num);
            row.appendChild(mark);
            row.appendChild(expTd);
            row.appendChild(gotTd);
            table.appendChild(row);
        }
        body.appendChild(table);

        var note = document.createElement('div');
        note.className = 'diff-note';
        var total = Math.max(cmp.exp.length, cmp.act.length);
        note.textContent = total > MAX_DIFF_LINES
            ? 'SHOWING FIRST ' + MAX_DIFF_LINES + ' OF ' + total + ' LINES — EXPECTED vs GOT'
            : 'EXPECTED vs GOT (first mismatch at line ' + (cmp.firstDiff + 1) + ')';
        body.appendChild(note);
    }

    // ----- Judge flow -----
    var runBtn = document.getElementById('runBtn');
    var running = false;

    runBtn.addEventListener('click', async function () {
        if (running) return;
        var cards = Array.from(testsBody.querySelectorAll('.test-card'));
        if (!cards.length) {
            clearResults();
            log('no test cases — add one first', 'bad');
            return;
        }

        running = true;
        runBtn.disabled = true;
        runBtn.innerHTML = 'RUNNING...';
        clearResults();

        var code = editor.getValue();
        var language = langSelect.value;
        var acCount = 0;

        for (var i = 0; i < cards.length; i++) {
            var card = cards[i];
            var stdin = card.querySelector('.input').value;
            var expected = card.querySelector('.expected').value;
            var gotArea = card.querySelector('.output');
            gotArea.value = '';

            setVerdict(card, '...', 'v-run');
            log('test #' + (i + 1) + ': compiling & running', 'dim');

            try {
                var data = await execute(code, language, stdin);

                if (data.compiler_error) {
                    setVerdict(card, 'CE', 'v-ce');
                    log('test #' + (i + 1) + ': compile error', 'bad');
                    renderDetail(i, 'CE', 'v-ce', function (body) {
                        renderPre(body, data.compiler_message || data.compiler_error);
                    });
                    continue;
                }

                gotArea.value = data.program_output || '';

                if (data.signal) {
                    setVerdict(card, 'TLE', 'v-tle');
                    log('test #' + (i + 1) + ': killed (' + data.signal + ') — likely time/memory limit', 'bad');
                    renderDetail(i, 'TLE', 'v-tle', function (body) {
                        renderPre(body, data.program_output || '(no output before killed)');
                    });
                    continue;
                }

                if (data.status !== '0') {
                    setVerdict(card, 'RE', 'v-re');
                    log('test #' + (i + 1) + ': runtime error (exit ' + data.status + ')', 'bad');
                    renderDetail(i, 'RE', 'v-re', function (body) {
                        renderPre(body, data.program_error || data.program_message);
                    });
                    continue;
                }

                var cmp = compare(expected, data.program_output || '');
                if (cmp.ok) {
                    setVerdict(card, 'AC', 'v-ac');
                    log('test #' + (i + 1) + ': accepted', 'ok');
                    acCount++;
                } else {
                    setVerdict(card, 'WA', 'v-wa');
                    log('test #' + (i + 1) + ': wrong answer at line ' + (cmp.firstDiff + 1), 'bad');
                    renderDetail(i, 'WA', 'v-wa', function (body) {
                        renderDiff(body, cmp);
                    });
                }
            } catch (err) {
                setVerdict(card, 'ERR', 'v-err');
                log('test #' + (i + 1) + ': judge error — ' + err.message, 'bad');
                renderDetail(i, 'ERR', 'v-err', function (body) {
                    renderPre(body, String(err));
                });
            }

            if (i < cards.length - 1) await sleep(REQUEST_GAP_MS);
        }

        log('done: ' + acCount + '/' + cards.length + ' accepted', acCount === cards.length ? 'ok' : 'info');

        running = false;
        runBtn.disabled = false;
        runBtn.innerHTML = '&#9654; RUN ALL';
    });

    // ----- Nav toggle (same behavior as homepage) -----
    var navToggle = document.getElementById('navToggle');
    var navMenu = document.getElementById('navMenu');
    navToggle.addEventListener('click', function () {
        navMenu.classList.toggle('open');
    });
})();
