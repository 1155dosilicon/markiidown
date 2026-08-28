export type ViewerMode = "interactive" | "print" | "watch" | "export" | "edit";
export type CliAction = "help" | "version" | "install" | "uninstall" | "register" | "unregister";

export interface CliOptions {
  action?: CliAction;
  mode: ViewerMode;
  targetFile?: string;
  exportPath?: string;
  raw?: boolean;
  lineNumbers?: boolean;
}

export class CliArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliArgumentError";
  }
}

/**
 * Analisa os argumentos sem executar efeitos colaterais, facilitando testes e
 * garantindo que opções desconhecidas ou contraditórias não sejam ignoradas.
 */
export function parseCliArgs(args: string[]): CliOptions {
  let action: CliAction | undefined;
  let mode: ViewerMode = "interactive";
  let explicitMode: ViewerMode | undefined;
  let targetFile: string | undefined;
  let exportPath: string | undefined;
  let raw = false;
  let lineNumbers = false;
  let positionalOnly = false;

  const setAction = (nextAction: CliAction) => {
    if (action && action !== nextAction) {
      throw new CliArgumentError(`As opções --${action} e --${nextAction} não podem ser usadas juntas.`);
    }
    action = nextAction;
  };

  const setMode = (nextMode: ViewerMode) => {
    if (explicitMode && explicitMode !== nextMode) {
      throw new CliArgumentError(`Os modos --${explicitMode} e --${nextMode} não podem ser usados juntos.`);
    }
    explicitMode = nextMode;
    mode = nextMode;
  };

  const addTarget = (value: string) => {
    if (targetFile) {
      throw new CliArgumentError(`Foi informado mais de um arquivo de entrada: "${targetFile}" e "${value}".`);
    }
    targetFile = value;
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (positionalOnly) {
      addTarget(arg);
      continue;
    }

    if (arg === "--") {
      positionalOnly = true;
      continue;
    }

    if (arg === "-h" || arg === "--help") setAction("help");
    else if (arg === "-v" || arg === "--version") setAction("version");
    else if (arg === "--install") setAction("install");
    else if (arg === "--uninstall") setAction("uninstall");
    else if (arg === "--register") setAction("register");
    else if (arg === "--unregister") setAction("unregister");
    else if (arg === "-p" || arg === "--print") setMode("print");
    else if (arg === "-i" || arg === "--interactive") setMode("interactive");
    else if (arg === "-w" || arg === "--watch") setMode("watch");
    else if (arg === "-E" || arg === "--edit") setMode("edit");
    else if (arg === "-r" || arg === "--raw") raw = true;
    else if (arg === "-n" || arg === "--numbers" || arg === "--line-numbers") lineNumbers = true;
    else if (arg === "-e" || arg === "--export") {
      const value = args[++i];
      if (!value || value.startsWith("-")) {
        throw new CliArgumentError("O parâmetro --export exige o caminho do arquivo HTML de saída.");
      }
      setMode("export");
      exportPath = value;
    } else if (arg.startsWith("--export=")) {
      const value = arg.slice("--export=".length);
      if (!value) {
        throw new CliArgumentError("O parâmetro --export exige o caminho do arquivo HTML de saída.");
      }
      setMode("export");
      exportPath = value;
    } else if (arg.startsWith("-")) {
      throw new CliArgumentError(`Opção desconhecida: ${arg}`);
    } else {
      addTarget(arg);
    }
  }

  if (action && (targetFile || explicitMode || raw || lineNumbers)) {
    throw new CliArgumentError(`A opção --${action} não pode ser combinada com arquivo ou opções de visualização.`);
  }

  return { action, mode, targetFile, exportPath, raw, lineNumbers };
}
