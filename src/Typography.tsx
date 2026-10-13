import {
  createContext,
  useContext,
  type ComponentPropsWithRef,
  type ReactNode,
} from 'react';
import {
  Text as NativeText,
  TextInput as NativeTextInput,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { combinedTextScale, textSizeStyle } from '@onpurpose/core/textSize';

const TextScale = createContext(1);
const InsideText = createContext(false);
export function TypographyProvider({
  scale,
  children,
}: {
  scale: number;
  children: ReactNode;
}) {
  return <TextScale.Provider value={scale}>{children}</TextScale.Provider>;
}
export function useAppWindowDimensions() {
  const dimensions = useWindowDimensions();
  const scale = useContext(TextScale);
  return {
    ...dimensions,
    fontScale: combinedTextScale(dimensions.fontScale, scale),
  };
}
export function Text({
  style,
  ref,
  ...props
}: ComponentPropsWithRef<typeof NativeText>) {
  const scale = useContext(TextScale);
  const nested = useContext(InsideText);
  const content = (
    <NativeText
      {...props}
      ref={ref}
      style={
        scale === 1 || props.allowFontScaling === false
          ? style
          : [style, textSizeStyle(StyleSheet.flatten(style), scale, nested)]
      }
    />
  );
  // Inline spans inherit their already-scaled parent's size; scale an explicit
  // span size only once. Decorative fixed-size glyphs stay aligned with SVGs.
  return nested ? (
    content
  ) : (
    <InsideText.Provider value>{content}</InsideText.Provider>
  );
}
export function TextInput({
  style,
  ref,
  ...props
}: ComponentPropsWithRef<typeof NativeTextInput>) {
  const scale = useContext(TextScale);
  return (
    <NativeTextInput
      {...props}
      ref={ref}
      style={
        scale === 1 || props.allowFontScaling === false
          ? style
          : [style, textSizeStyle(StyleSheet.flatten(style), scale)]
      }
    />
  );
}
