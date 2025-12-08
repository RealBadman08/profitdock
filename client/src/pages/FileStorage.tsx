import { useAuth } from "@/_core/hooks/useAuth";
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
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Upload, FileText, Trash2, Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

export default function FileStorage() {
  const { user, loading: authLoading } = useAuth();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [category, setCategory] = useState<"strategy" | "log" | "config" | "other">("strategy");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);

  const { data: files, isLoading, refetch } = trpc.files.list.useQuery(undefined, {
    enabled: !!user,
  });

  const uploadMutation = trpc.files.upload.useMutation({
    onSuccess: () => {
      toast.success("File uploaded successfully");
      setSelectedFile(null);
      setDescription("");
      refetch();
    },
    onError: (error) => {
      toast.error(`Upload failed: ${error.message}`);
    },
  });

  const deleteMutation = trpc.files.delete.useMutation({
    onSuccess: () => {
      toast.success("File deleted successfully");
      refetch();
    },
    onError: (error) => {
      toast.error(`Delete failed: ${error.message}`);
    },
  });

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
      // Convert file to base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = e.target?.result as string;
        const base64Content = base64Data.split(",")[1]; // Remove data:mime;base64, prefix

        await uploadMutation.mutateAsync({
          filename: selectedFile.name,
          mimeType: selectedFile.type,
          fileSize: selectedFile.size,
          category,
          description: description || undefined,
          base64Data: base64Content,
        });

        setUploading(false);
      };
      reader.readAsDataURL(selectedFile);
    } catch (error) {
      setUploading(false);
      console.error("Upload error:", error);
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this file?")) {
      deleteMutation.mutate({ id });
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "Unknown";
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(2)} KB`;
    return `${(kb / 1024).toFixed(2)} MB`;
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="bg-card border-border max-w-md">
          <CardHeader>
            <CardTitle className="text-foreground">Authentication Required</CardTitle>
            <CardDescription className="text-muted-foreground">
              Please log in to access file storage
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full bg-accent hover:bg-accent-glow text-white">
              <a href={getLoginUrl()}>Log In</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/">
              <a className="text-xl font-bold text-foreground hover:text-accent transition-colors">
                ← Back to ProfitDock
              </a>
            </Link>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">{user.name || user.email}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold mb-2 text-foreground">File Storage</h1>
        <p className="text-muted-foreground mb-8">
          Upload and manage your trading bot strategy files, logs, and configurations
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Upload Section */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Upload File
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Upload strategy files, logs, or configuration files
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="file" className="text-foreground">
                  Select File
                </Label>
                <Input
                  id="file"
                  type="file"
                  onChange={handleFileSelect}
                  className="bg-input border-border text-foreground"
                />
                {selectedFile && (
                  <p className="text-sm text-muted-foreground">
                    Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="category" className="text-foreground">
                  Category
                </Label>
                <Select value={category} onValueChange={(v: any) => setCategory(v)}>
                  <SelectTrigger className="bg-input border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="strategy">Strategy</SelectItem>
                    <SelectItem value="log">Log</SelectItem>
                    <SelectItem value="config">Configuration</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description" className="text-foreground">
                  Description (Optional)
                </Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add a description for this file..."
                  className="bg-input border-border text-foreground"
                />
              </div>

              <Button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="w-full button-glow bg-accent hover:bg-accent-glow text-white"
              >
                {uploading ? "Uploading..." : "Upload File"}
              </Button>
            </CardContent>
          </Card>

          {/* Stats Card */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Storage Statistics</CardTitle>
              <CardDescription className="text-muted-foreground">
                ProfitDock file storage overview
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="card bg-muted/30 text-center">
                  <p className="text-sm text-muted-foreground mb-1">Total Files</p>
                  <p className="text-2xl font-bold text-foreground">{files?.length || 0}</p>
                </div>
                <div className="card bg-muted/30 text-center">
                  <p className="text-sm text-muted-foreground mb-1">Total Size</p>
                  <p className="text-2xl font-bold text-accent">
                    {formatFileSize(
                      files?.reduce((acc, file) => acc + (file.fileSize || 0), 0) || 0
                    )}
                  </p>
                </div>
                <div className="card bg-muted/30 text-center">
                  <p className="text-sm text-muted-foreground mb-1">Strategies</p>
                  <p className="text-2xl font-bold text-green-500">
                    {files?.filter((f) => f.category === "strategy").length || 0}
                  </p>
                </div>
                <div className="card bg-muted/30 text-center">
                  <p className="text-sm text-muted-foreground mb-1">Logs</p>
                  <p className="text-2xl font-bold text-blue-500">
                    {files?.filter((f) => f.category === "log").length || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Files List */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Your Files</CardTitle>
            <CardDescription className="text-muted-foreground">
              Manage your uploaded files
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-center text-muted-foreground py-8">Loading files...</p>
            ) : files && files.length > 0 ? (
              <div className="space-y-3">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border"
                  >
                    <div className="flex items-start gap-4 flex-1">
                      <FileText className="w-8 h-8 text-accent flex-shrink-0 mt-1" />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground truncate">
                          {file.filename}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {file.category} • {formatFileSize(file.fileSize)} •{" "}
                          {new Date(file.createdAt).toLocaleDateString()}
                        </p>
                        {file.description && (
                          <p className="text-sm text-muted-foreground mt-1">{file.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="border-border text-foreground hover:bg-accent/10"
                      >
                        <a href={file.url} target="_blank" rel="noopener noreferrer">
                          <Download className="w-4 h-4" />
                        </a>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(file.id)}
                        className="border-border text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                <p className="text-muted-foreground">No files uploaded yet</p>
                <p className="text-sm text-muted-foreground mt-1">
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
