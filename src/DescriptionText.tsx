import { Text } from './Typography';
import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  highlightPalette,
  isHighlightColour,
} from '@onpurpose/core/richText/highlights';
import { themedStyles, useTheme } from './ThemeContext';
import { openDescriptionLink } from './descriptionLinks';
import {
  parseDescription,
  type DescriptionToken,
} from '@onpurpose/core/description';

type Node = { token: DescriptionToken; children: Node[] };
function tree(tokens: DescriptionToken[]) {
  const root: Node[] = [],
    stack = [root];
  for (const token of tokens) {
    if (token.nesting === -1) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const node = { token, children: [] as Node[] };
    stack.at(-1)!.push(node);
    if (token.nesting === 1) stack.push(node.children);
  }
  return root;
}
export const DescriptionText = memo(function DescriptionText({
  text,
  tokens,
  colour,
}: {
  text?: string;
  tokens?: DescriptionToken[];
  colour: string;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const highlights = highlightPalette(theme.scheme);
  const linkColour = theme.colour(colour);
  function inline(nodes: Node[]): ReactNode[] {
    return nodes.map(({ token, children }, index) => {
      if (token.type === 'text' || token.type === 'html_inline')
        return token.content;
      if (token.type === 'softbreak' || token.type === 'hardbreak') return '\n';
      if (token.type === 'image') return token.content; // Alt text only; no unsolicited network loads.
      if (token.type === 'code_inline')
        return (
          <Text key={index} style={styles.inlineCode}>
            {token.content}
          </Text>
        );
      if (token.type === 'highlight_open') {
        const id = token.attrGet('colour');
        const colour = highlights[isHighlightColour(id) ? id : 'yellow'];
        return (
          <Text
            key={index}
            style={{ backgroundColor: colour.background, color: colour.text }}
          >
            {inline(children)}
          </Text>
        );
      }
      if (token.type === 'link_open') {
        const url = String(token.attrGet('href') ?? '');
        return (
          <Text
            key={index}
            accessibilityRole="link"
            accessibilityHint={`Open ${url}`}
            onPress={() => {
              void openDescriptionLink(url);
            }}
            style={{ color: linkColour, textDecorationLine: 'underline' }}
          >
            {inline(children)}
          </Text>
        );
      }
      return (
        <Text
          key={index}
          style={
            token.type === 'strong_open'
              ? styles.bold
              : token.type === 'em_open'
                ? styles.italic
                : token.type === 's_open'
                  ? styles.strike
                  : undefined
          }
        >
          {inline(children)}
        </Text>
      );
    });
  }
  function blocks(nodes: Node[]): ReactNode[] {
    return nodes.map(({ token, children }, index) => {
      if (token.type === 'inline')
        return (
          <Text key={index} selectable style={styles.body}>
            {inline(tree(token.children ?? []))}
          </Text>
        );
      if (token.type === 'paragraph_open')
        return (
          <View key={index} style={{ marginBottom: token.hidden ? 0 : 8 }}>
            {blocks(children)}
          </View>
        );
      if (token.type === 'heading_open')
        return (
          <Text
            key={index}
            selectable
            accessibilityRole="header"
            style={[
              styles.body,
              {
                fontSize:
                  token.tag === 'h1' ? 23 : token.tag === 'h2' ? 19 : 16,
                lineHeight: token.tag === 'h1' ? 30 : 25,
                fontWeight: '600',
                marginBottom: 8,
              },
            ]}
          >
            {children.map((child) => inline(tree(child.token.children ?? [])))}
          </Text>
        );
      if (
        token.type === 'bullet_list_open' ||
        token.type === 'ordered_list_open'
      ) {
        const start = Number(token.attrGet('start') ?? 1);
        return (
          <View key={index} style={{ gap: 6, marginBottom: 8 }}>
            {children.map((child, item) => (
              <View key={item} style={{ flexDirection: 'row', gap: 8 }}>
                <Text style={[styles.body, { minWidth: 18 }]}>
                  {token.type === 'ordered_list_open'
                    ? `${start + item}.`
                    : '•'}
                </Text>
                <View style={{ flex: 1 }}>{blocks(child.children)}</View>
              </View>
            ))}
          </View>
        );
      }
      if (token.type === 'blockquote_open')
        return (
          <View key={index} style={styles.quote}>
            {blocks(children)}
          </View>
        );
      if (token.type === 'code_block' || token.type === 'fence')
        return (
          <Text key={index} selectable style={styles.code}>
            {token.content.replace(/\n$/, '')}
          </Text>
        );
      if (token.type === 'hr') return <View key={index} style={styles.rule} />;
      return <View key={index}>{blocks(children)}</View>;
    });
  }
  return <View>{blocks(tree(tokens ?? parseDescription(text ?? '')))}</View>;
});
const useStyles = themedStyles((t) => ({
  body: { color: t.ink(0xc7), fontSize: 15, lineHeight: 23 },
  bold: { fontWeight: '700', color: t.ink(0xe2) },
  italic: { fontStyle: 'italic' },
  strike: { textDecorationLine: 'line-through' },
  inlineCode: { fontFamily: 'monospace', backgroundColor: t.ink(0x20) },
  quote: {
    borderLeftWidth: 2,
    borderLeftColor: t.ink(0x50),
    paddingLeft: 12,
    marginBottom: 8,
  },
  code: {
    color: t.ink(0xcc),
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'monospace',
    padding: 12,
    backgroundColor: t.ink(0x15),
    borderRadius: 8,
    marginBottom: 8,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: t.ink(0x30),
    marginVertical: 10,
  },
}));
