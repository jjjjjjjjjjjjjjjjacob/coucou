import {
  type CsvSharingDependencies,
  shareTemporaryCsv,
} from "../csv";

describe("temporary CSV sharing", () => {
  const mockCreate = jest.fn();
  const mockWrite = jest.fn();
  const mockDelete = jest.fn();
  const mockIsSharingAvailable = jest.fn();
  const mockShare = jest.fn();
  const mockCreateTemporaryFile = jest.fn((filename: string) => ({
    create: mockCreate,
    delete: mockDelete,
    exists: true,
    uri: `file:///cache/${filename}`,
    write: mockWrite,
  }));
  const dependencies: CsvSharingDependencies = {
    createTemporaryFile: mockCreateTemporaryFile,
    isSharingAvailable: mockIsSharingAvailable,
    shareFile: mockShare,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsSharingAvailable.mockResolvedValue(true);
    mockShare.mockResolvedValue(undefined);
  });

  it("adds a CSV extension, shares the file, and deletes it", async () => {
    await shareTemporaryCsv("guest-list", "Name\nAvery", dependencies);

    expect(mockCreateTemporaryFile).toHaveBeenCalledWith("guest-list.csv");
    expect(mockCreate).toHaveBeenCalledWith({ overwrite: true });
    expect(mockWrite).toHaveBeenCalledWith("Name\nAvery");
    expect(mockShare).toHaveBeenCalledWith("file:///cache/guest-list.csv");
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it("deletes the temporary file when the native share sheet fails", async () => {
    mockShare.mockRejectedValue(new Error("Share failed"));

    await expect(
      shareTemporaryCsv("guest-list.csv", "Name\nAvery", dependencies),
    ).rejects.toThrow("Share failed");
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it("does not write a file when sharing is unavailable", async () => {
    mockIsSharingAvailable.mockResolvedValue(false);

    await expect(
      shareTemporaryCsv("guest-list.csv", "Name\nAvery", dependencies),
    ).rejects.toThrow("Sharing is not available");
    expect(mockCreateTemporaryFile).not.toHaveBeenCalled();
  });
});
