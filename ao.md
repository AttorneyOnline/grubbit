- Client connects to server with grubbit in FL packet
- Server sends a list of suggested mappings from legacy character names to hashes as a new packet: `ASSETS#<json object>#%`

```typescript
interface AssetInfo {
  mappings: {
    characters: { [name: string]: string; };
    resources: { [file: string]: string | object };
  };
  repositories: {
    url: string;
    type: "full" | "mini";
  };
  downloadAssets: string[];
}
```
