import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

interface TemporaryCsvFile {
  create: (options: { overwrite: boolean }) => void;
  delete: () => void;
  readonly exists: boolean;
  readonly uri: string;
  write: (content: string) => void;
}

export interface CsvSharingDependencies {
  createTemporaryFile: (filename: string) => TemporaryCsvFile;
  isSharingAvailable: () => Promise<boolean>;
  shareFile: (uri: string) => Promise<void>;
}

const nativeCsvSharingDependencies: CsvSharingDependencies = {
  createTemporaryFile: (filename) => new File(Paths.cache, filename),
  isSharingAvailable: Sharing.isAvailableAsync,
  shareFile: async (uri) => {
    await Sharing.shareAsync(uri, {
      dialogTitle: "Export guest list",
      mimeType: "text/csv",
      UTI: "public.comma-separated-values-text",
    });
  },
};

export async function shareTemporaryCsv(
  filename: string,
  csvContent: string,
  dependencies: CsvSharingDependencies = nativeCsvSharingDependencies,
): Promise<void> {
  if (!(await dependencies.isSharingAvailable())) {
    throw new Error("Sharing is not available on this device.");
  }

  const sanitizedFilename = filename.endsWith(".csv")
    ? filename
    : `${filename}.csv`;
  const temporaryFile =
    dependencies.createTemporaryFile(sanitizedFilename);
  temporaryFile.create({ overwrite: true });
  try {
    temporaryFile.write(csvContent);
    await dependencies.shareFile(temporaryFile.uri);
  } finally {
    if (temporaryFile.exists) {
      temporaryFile.delete();
    }
  }
}
