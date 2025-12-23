import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Download } from "lucide-react";

export default function Reports() {
    return (
        <div className="container mx-auto p-6 max-w-6xl">
            <h1 className="text-2xl font-bold text-white mb-6">Reports</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="bg-[#2A2A2A] border-gray-800 hover:border-gray-700 transition-colors cursor-pointer group">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-white group-hover:text-[#D600AA] transition-colors">Profit Table</CardTitle>
                        <FileText className="w-6 h-6 text-gray-400 group-hover:text-[#D600AA]" />
                    </CardHeader>
                    <CardContent>
                        <p className="text-gray-400">View your trading profit/loss history.</p>
                    </CardContent>
                </Card>

                <Card className="bg-[#2A2A2A] border-gray-800 hover:border-gray-700 transition-colors cursor-pointer group">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-white group-hover:text-[#D600AA] transition-colors">Statement</CardTitle>
                        <Download className="w-6 h-6 text-gray-400 group-hover:text-[#D600AA]" />
                    </CardHeader>
                    <CardContent>
                        <p className="text-gray-400">View your account statement and transactions.</p>
                    </CardContent>
                </Card>
            </div>

            <div className="mt-8 text-center text-gray-500">
                <p>This is a simplified Reports view.</p>
            </div>
        </div>
    );
}
