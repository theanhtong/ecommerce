import { parseCsv, toCsv } from './csv.js';

describe('parseCsv', () => {
  it('parses plain rows with CRLF and LF', () => {
    expect(parseCsv('a,b\r\n1,2\n3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('handles quotes, embedded commas, newlines and escaped quotes', () => {
    expect(parseCsv('name,desc\n"Áo, thun","dòng 1\ndòng ""2"""\n')).toEqual([
      ['name', 'desc'],
      ['Áo, thun', 'dòng 1\ndòng "2"'],
    ]);
  });

  it('strips the Excel BOM, keeps empty fields and drops blank lines', () => {
    expect(parseCsv('﻿a,b,c\n1,,3\n\n,,\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ]);
  });

  it('rejects an unterminated quote', () => {
    expect(() => parseCsv('a\n"oops')).toThrow();
  });

  it('round-trips through toCsv', () => {
    const rows = [
      ['x', 'a,b', 'say "hi"', 'line\nbreak'],
      ['1', '', '', ''],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});
