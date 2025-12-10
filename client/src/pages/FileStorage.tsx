import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Upload, FileText, Trash2, Download } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

interface StoredFile {
  id: number;
  filename: string;
  mimeType: string;
  fileSize: number;
  category: string;
  description?: string;
  content: string; // Base64 content
  createdAt: string;
  url?: string; // Mock url
}

export default function FileStorage() {
  const { isAuthenticated, currentAccount } = useAuth();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [category, setCategory] = useState<"strategy" | "log" | "config" | "other">("strategy");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState<StoredFile[]>([]);

  useEffect(() => {
    // Load files from local storage
    const savedFiles = localStorage.getItem('profitdock_files');
    if (savedFiles) {
      try {
        setFiles(JSON.parse(savedFiles));
      } catch (e) {
        console.error("Failed to parse files", e);
      }
    }
  }, []);

  const saveFiles = (newFiles: StoredFile[]) => {
    setFiles(newFiles);
    localStorage.setItem('profitdock_files', JSON.stringify(newFiles));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error("Please select a file");
      return;
    }

    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = e.target?.result as string;

        const newFile: StoredFile = {
          id: Date.now(),
          filename: selectedFile.name,
          mimeType: selectedFile.type,
          fileSize: selectedFile.size,
          category,
          description,
          content: base64Data,
          createdAt: new Date().toISOString(),
          url: base64Data // Data URL works for download
        };

        const updatedFiles = [newFile, ...files];
        saveFiles(updatedFiles);

        toast.success("File uploaded successfully");
        setSelectedFile(null);
        setDescription("");
        setUploading(false);
      };
      reader.readAsDataURL(selectedFile);
    } catch (error) {
      setUploading(false);
      console.error("Upload error:", error);
      toast.error("Upload failed");
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this file?")) {
      const updatedFiles = files.filter(f => f.id !== id);
      saveFiles(updatedFiles);
      toast.success("File deleted successfully");
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "Unknown";
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(2)} KB`;
    return `${(kb / 1024).toFixed(2)} MB`;
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#1A1A1A] flex items-center justify-center">
        <Card className="bg-[#2A2A2A] border-gray-800 max-w-md">
          <CardHeader>
            <CardTitle className="text-white">Authentication Required</CardTitle>
            <CardDescription className="text-gray-400">
              Please log in to access file storage
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full bg-[#C026D3] hover:bg-[#A021B3] text-white">
              <Link href="/login">Log In</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1A1A1A] text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-[#2A2A2A]/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/">
              <a className="text-xl font-bold text-white hover:text-[#C026D3] transition-colors">
                ← Back to ProfitDock
              </a>
            </Link>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-400">{currentAccount?.loginid}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold mb-2 text-white">File Storage</h1>
        <p className="text-gray-400 mb-8">
          Upload and manage your trading bot strategy files, logs, and configurations (Local Storage)
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Upload Section */}
          <Card className="bg-[#2A2A2A] border-gray-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Upload File
              </CardTitle>
              <CardDescription className="text-gray-400">
                Upload strategy files, logs, or configuration files
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="file" className="text-gray-300">
                  Select File
                </Label>
                <Input
                  id="file"
                  type="file"
                  onChange={handleFileSelect}
                  className="bg-[#1A1A1A] border-gray-700 text-white"
                />
                {selectedFile && (
                  <p className="text-sm text-gray-400">
                    Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="category" className="text-gray-300">
                  Category
                </Label>
                <Select value={category} onValueChange={(v: any) => setCategory(v)}>
                  <SelectTrigger className="bg-[#1A1A1A] border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#2A2A2A] border-gray-700">
                    <SelectItem value="strategy" className="text-white">Strategy</SelectItem>
                    <SelectItem value="log" className="text-white">Log</SelectItem>
                    <SelectItem value="config" className="text-white">Configuration</SelectItem>
                    <SelectItem value="other" className="text-white">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description" className="text-gray-300">
                  Description (Optional)
                </Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add a description for this file..."
                  className="bg-[#1A1A1A] border-gray-700 text-white"
                />
              </div>

              <Button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="w-full bg-[#C026D3] hover:bg-[#A021B3] text-white"
              >
                {uploading ? "Uploading..." : "Upload File"}
              </Button>
            </CardContent>
          </Card>

          {/* Stats Card */}
          <Card className="bg-[#2A2A2A] border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Storage Statistics</CardTitle>
              <CardDescription className="text-gray-400">
                Local storage usage
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-[#1A1A1A] rounded-lg text-center">
                  <p className="text-sm text-gray-400 mb-1">Total Files</p>
                  <p className="text-2xl font-bold text-white">{files.length}</p>
                </div>
                <div className="p-4 bg-[#1A1A1A] rounded-lg text-center">
                  <p className="text-sm text-gray-400 mb-1">Total Size</p>
                  <p className="text-2xl font-bold text-[#C026D3]">
                    {formatFileSize(
                      files.reduce((acc, file) => acc + (file.fileSize || 0), 0)
                    )}
                  </p>
                </div>
                <div className="p-4 bg-[#1A1A1A] rounded-lg text-center">
                  <p className="text-sm text-gray-400 mb-1">Strategies</p>
                  <p className="text-2xl font-bold text-green-500">
                    {files.filter((f) => f.category === "strategy").length}
                  </p>
                </div>
                <div className="p-4 bg-[#1A1A1A] rounded-lg text-center">
                  <p className="text-sm text-gray-400 mb-1">Logs</p>
                  <p className="text-2xl font-bold text-blue-500">
                    {files.filter((f) => f.category === "log").length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Files List */}
        <Card className="bg-[#2A2A2A] border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Your Files</CardTitle>
            <CardDescription className="text-gray-400">
              Manage your uploaded files
            </CardDescription>
          </CardHeader>
          <CardContent>
            {files && files.length > 0 ? (
              <div className="space-y-3">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-[#1A1A1A] border border-gray-700"
                  >
                    <div className="flex items-start gap-4 flex-1">
                      <FileText className="w-8 h-8 text-[#C026D3] flex-shrink-0 mt-1" />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white truncate">
                          {file.filename}
                        </h3>
                        <p className="text-sm text-gray-400">
                          {file.category} • {formatFileSize(file.fileSize)} •{" "}
                          {new Date(file.createdAt).toLocaleDateString()}
                        </p>
                        {file.description && (
                          <p className="text-sm text-gray-500 mt-1">{file.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {file.url && (
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          className="border-gray-700 text-white hover:bg-[#3A3A3A]"
                        >
                          <a href={file.url} download={file.filename}>
                            <Download className="w-4 h-4" />
                          </a>
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(file.id)}
                        className="border-gray-700 text-red-500 hover:bg-red-900/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4 opacity-50" />
                <p className="text-gray-400">No files uploaded yet</p>
                <p className="text-sm text-gray-500 mt-1">
                  Upload your first file to get started
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
