// Vite `?raw` imports: test fixtures are loaded as strings.
declare module '*?raw' {
  const content: string;
  export default content;
}
