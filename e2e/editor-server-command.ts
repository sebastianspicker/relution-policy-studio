export function editorServerCommand(options: { readonly workspace: string; readonly output: string; readonly port: number }): string {
  const { workspace, output, port } = options;
  return `rm -rf ${workspace} ${output} && env -u FORCE_COLOR node dist/src/cli.js serve --workspace ${workspace} --out ${output} --host 127.0.0.1 --port ${String(port)} --key key123`;
}
