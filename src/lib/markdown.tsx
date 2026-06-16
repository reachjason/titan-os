import React from "react";

/**
 * Tiny, dependency-free Markdown renderer for short log entries.
 * Supports: **bold**, *italic* / _italic_, `inline code`, ~~strikethrough~~,
 * [links](https://…), `- `/`* ` bullet lists, and line breaks.
 *
 * It only ever emits text + a fixed set of safe elements (never raw HTML), so
 * there's no injection surface. Unmatched markup is rendered as literal text.
 */

let keySeq = 0;
function nextKey() {
  return `md-${keySeq++}`;
}

// Inline rules, applied in order. Each captures its inner content for recursion
// (except code + link, which are terminal).
const INLINE_RULES: {
  re: RegExp;
  render: (m: RegExpExecArray) => React.ReactNode;
}[] = [
  {
    // `code` — terminal, no nested formatting
    re: /`([^`]+)`/,
    render: (m) => <code key={nextKey()} className="md-code">{m[1]}</code>,
  },
  {
    // @mention — highlighted; keeps the "@" so it reads as a tag. Requires a
    // word boundary before "@" so emails (a@b.com) aren't matched.
    re: /(?:^|(?<=\s))@([a-z0-9][a-z0-9_-]*)/i,
    render: (m) => (
      <span key={nextKey()} className="mention">
        @{m[1]}
      </span>
    ),
  },
  {
    // [text](url) — only http(s)/mailto links are linkified; others stay literal
    re: /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/,
    render: (m) => (
      <a key={nextKey()} className="md-link" href={m[2]} target="_blank" rel="noopener noreferrer">
        {renderInline(m[1])}
      </a>
    ),
  },
  {
    re: /\*\*([^*]+)\*\*/,
    render: (m) => <strong key={nextKey()}>{renderInline(m[1])}</strong>,
  },
  {
    re: /~~([^~]+)~~/,
    render: (m) => <del key={nextKey()}>{renderInline(m[1])}</del>,
  },
  {
    // *italic* — avoid matching ** (handled above) by requiring non-* edges
    re: /\*([^*\s][^*]*?)\*/,
    render: (m) => <em key={nextKey()}>{renderInline(m[1])}</em>,
  },
  {
    // _italic_ — require word boundaries so snake_case isn't italicized
    re: /(?:^|(?<=\s))_([^_\s][^_]*?)_(?=\s|$|[.,!?;:])/,
    render: (m) => <em key={nextKey()}>{renderInline(m[1])}</em>,
  },
];

/** Render a single line of inline markdown into React nodes. */
function renderInline(text: string): React.ReactNode[] {
  // Find the earliest-matching rule, render it, recurse on the surrounding text.
  let best: { idx: number; len: number; node: React.ReactNode } | null = null;
  for (const rule of INLINE_RULES) {
    const m = rule.re.exec(text);
    if (m && (best === null || m.index < best.idx)) {
      best = { idx: m.index, len: m[0].length, node: rule.render(m) };
    }
  }
  if (!best) return [text];
  const before = text.slice(0, best.idx);
  const after = text.slice(best.idx + best.len);
  return [...(before ? [before] : []), best.node, ...renderInline(after)];
}

/**
 * Render block-level markdown (paragraphs, bullet lists, line breaks) for an
 * entry body. Returns React nodes suitable for placement inside a text span.
 */
export function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: React.ReactNode[] | null = null;
  // Track whether the previous block was a text line, so we insert a single
  // newline *between* text lines without a trailing one (avoids a blank gap).
  let prevWasText = false;

  const flushList = () => {
    if (list && list.length) {
      blocks.push(
        <ul key={nextKey()} className="md-list">
          {list}
        </ul>
      );
    }
    list = null;
  };

  for (const line of lines) {
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      if (!list) list = [];
      list.push(<li key={nextKey()}>{renderInline(bullet[1])}</li>);
      prevWasText = false;
    } else {
      flushList();
      blocks.push(
        <React.Fragment key={nextKey()}>
          {prevWasText ? "\n" : null}
          {renderInline(line)}
        </React.Fragment>
      );
      prevWasText = true;
    }
  }
  flushList();
  return blocks;
}
