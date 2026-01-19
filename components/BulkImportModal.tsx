
import React, { useState } from 'react';

type ImportType = 'domains' | 'ssl';

interface BulkImportModalProps {
  type: ImportType;
  onClose: () => void;
  onImport: (type: ImportType, data: Record<string, string>[]) => Promise<{ success: number; failed: number }>;
}

const BulkImportModal: React.FC<BulkImportModalProps> = ({ type, onClose, onImport }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ success: number; failed: number } | null>(null);

  const config = {
    domains: {
      title: 'Bulk Import Domains',
      description: 'Upload a CSV. Required header: "domain". Optional header: "managedBy". Each row should contain one domain name.',
      template: 'data:text/csv;charset=utf-8,domain,managedBy\ngoogle.com,Marketing Team\nexample.com,',
      color: 'blue'
    },
    ssl: {
      title: 'Bulk Import SSL Certificates',
      description: 'Upload a CSV. Required header: "domain". Optional headers: "host", "managedBy", "ipAddress".',
      template: 'data:text/csv;charset=utf-8,domain,host,managedBy,ipAddress\ngoogle.com,,Google Trust Services,142.250.72.78\nexample.com,alt.example.com,,',
      color: 'indigo'
    }
  };

  const currentConfig = config[type];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    setResult(null);
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'text/csv') {
      setFile(selectedFile);
    } else {
      setFile(null);
      setError('Please select a valid .csv file.');
    }
  };

  const parseCSV = (csvText: string): Record<string, string>[] => {
    const lines = csvText.trim().replace(/\r/g, '').split('\n');
    if (lines.length < 2) return [];
    const header = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
      const values = line.split(',');
      const rowObject: Record<string, string> = {};
      header.forEach((key, index) => {
        rowObject[key] = values[index]?.trim() || '';
      });
      return rowObject;
    });
  };

  const handleImport = async () => {
    if (!file) {
      setError('Please select a file to import.');
      return;
    }
    setIsImporting(true);
    setError('');
    setResult(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const csvText = event.target?.result as string;
      const parsedData = parseCSV(csvText);
      
      if (parsedData.length === 0 || !parsedData[0].hasOwnProperty('domain')) {
        setError('Invalid CSV format. Ensure the "domain" header is present and there is data.');
        setIsImporting(false);
        return;
      }
      
      try {
        const importResult = await onImport(type, parsedData);
        setResult(importResult);
      } catch (err: any) {
        setError(err.message || 'An unknown error occurred during import.');
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`bg-white w-full max-w-lg rounded-2xl shadow-2xl p-8 animate-in zoom-in-95 duration-200 border-t-4 border-${currentConfig.color}-600`}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-slate-900">{currentConfig.title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {!result ? (
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <p className="text-sm text-slate-600 mb-2">{currentConfig.description}</p>
              <a href={currentConfig.template} download={`${type}_template.csv`} className={`text-xs font-bold text-${currentConfig.color}-600 hover:underline`}>
                Download Template CSV
              </a>
            </div>

            {error && <p className="text-sm text-rose-600 bg-rose-50 p-3 rounded-lg">{error}</p>}
            
            <div>
              <label htmlFor="file-upload" className="block w-full cursor-pointer bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-slate-400 transition-colors">
                <input id="file-upload" type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
                {file ? (
                  <p className="font-bold text-slate-700">{file.name}</p>
                ) : (
                  <p className="text-slate-500">Click to select a .csv file</p>
                )}
              </label>
            </div>

            <button
              onClick={handleImport}
              disabled={!file || isImporting}
              className={`w-full bg-${currentConfig.color}-600 hover:bg-${currentConfig.color}-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-all transform active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2`}
            >
              {isImporting ? 'Processing...' : 'Import Data'}
            </button>
          </div>
        ) : (
          <div className="text-center space-y-4">
            <h4 className="text-2xl font-bold text-slate-800">Import Complete</h4>
            <div className="flex justify-center gap-6">
              <div className="p-4 bg-emerald-50 rounded-lg">
                <p className="text-3xl font-black text-emerald-600">{result.success}</p>
                <p className="text-xs font-bold text-emerald-500 uppercase">Successful</p>
              </div>
              <div className="p-4 bg-rose-50 rounded-lg">
                <p className="text-3xl font-black text-rose-600">{result.failed}</p>
                <p className="text-xs font-bold text-rose-500 uppercase">Failed</p>
              </div>
            </div>
            <p className="text-sm text-slate-500">You can now close this window. Your list has been updated.</p>
            <button onClick={onClose} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-4 rounded-xl">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default BulkImportModal;
