import { useState, useEffect, useMemo } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { useToast } from "./context/ToastContext";
import { useApi } from "./hooks/useApi";
import { UPLOAD_URL } from "./config/api";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import VerifyEmail from "./pages/VerifyEmail";
import NotFound from "./pages/NotFound";
import DashboardPage from "./pages/Dashboard";
import InputPage from "./pages/Input";
import OutputPage from "./pages/Output";
import EmployeeDetailPage from "./pages/EmployeeDetail";
import AiSettingsPage from "./pages/AiSettings";
import HistoryPage from "./pages/History";

function DashboardWrapper() {
  const { api } = useApi();
  const { showToast } = useToast();
  const [datasets, setDatasets] = useState([]);
  const [activeDataset, setActiveDataset] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    refreshDatasets();
  }, []);

  async function refreshDatasets() {
    setLoading(true);
    try {
      const result = await api("/datasets");
      setDatasets(result.datasets || []);
      if (result.datasets?.length) {
        await openDataset(result.datasets[0].id, false);
      } else {
        setActiveDataset(null);
      }
    } catch (err) {
      // toast already shown by useApi
    } finally {
      setLoading(false);
    }
  }

  async function openDataset(id, showLoader = true) {
    if (showLoader) setLoading(true);
    try {
      const result = await api(`/datasets/${id}`);
      setActiveDataset(result.dataset);
    } catch (err) {
      // toast already shown
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardPage
      activeDataset={activeDataset}
      datasets={datasets}
      loading={loading}
      onSelectDataset={openDataset}
    />
  );
}

function InputWrapper() {
  const { api } = useApi();
  const { session } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [datasets, setDatasets] = useState([]);
  const [activeDataset, setActiveDataset] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeMessage, setAnalyzeMessage] = useState("");

  useEffect(() => {
    refreshDatasets();
  }, []);

  async function refreshDatasets() {
    setLoading(true);
    try {
      const result = await api("/datasets");
      setDatasets(result.datasets || []);
      if (result.datasets?.length) {
        await openDataset(result.datasets[0].id, false);
      } else {
        setActiveDataset(null);
        setRecords([]);
      }
    } catch (err) {
      // toast already shown
    } finally {
      setLoading(false);
    }
  }

  async function openDataset(id, showLoader = true) {
    if (showLoader) setLoading(true);
    try {
      const result = await api(`/datasets/${id}`);
      setActiveDataset(result.dataset);
      const recordResult = await api(`/datasets/${id}/records?limit=80`);
      setRecords(recordResult.records || []);
    } catch (err) {
      // toast already shown
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(file) {
    if (!file) return;
    setUploading(true);
    try {
      const authHeaders = {};
      if (session?.access_token) {
        authHeaders["Authorization"] = `Bearer ${session.access_token}`;
      }

      let result;

      // Use chunked upload for files > 4MB to bypass proxy limits
      const CHUNK_THRESHOLD = 4 * 1024 * 1024; // 4MB
      const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB per chunk

      if (file.size > CHUNK_THRESHOLD) {
        // ── Chunked upload ──
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

        // Init upload session
        const initRes = await fetch(`${UPLOAD_URL}/datasets/upload-init`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ originalName: file.name, totalChunks }),
        });
        if (!initRes.ok) {
          const body = await initRes.json().catch(() => ({}));
          throw new Error(body.error || "Gagal memulai upload.");
        }
        const { uploadId } = await initRes.json();

        // Upload each chunk (NO Content-Type header — browser sets it with boundary)
        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, file.size);
          const chunk = file.slice(start, end);

          const chunkForm = new FormData();
          chunkForm.append("chunk", chunk, `chunk-${i}`);
          chunkForm.append("index", String(i));

          const chunkRes = await fetch(`${UPLOAD_URL}/datasets/upload-chunk/${uploadId}`, {
            method: "PUT",
            headers: { Authorization: authHeaders.Authorization },
            body: chunkForm,
          });
          if (!chunkRes.ok) {
            const body = await chunkRes.json().catch(() => ({}));
            throw new Error(body.error || `Gagal upload chunk ${i + 1}/${totalChunks}.`);
          }
        }

        // Complete upload
        const completeRes = await fetch(`${UPLOAD_URL}/datasets/upload-complete/${uploadId}`, {
          method: "POST",
          headers: { Authorization: authHeaders.Authorization },
        });
        if (!completeRes.ok) {
          const body = await completeRes.json().catch(() => ({}));
          throw new Error(body.error || "Gagal menyelesaikan upload.");
        }
        result = await completeRes.json();
      } else {
        // ── Direct upload for small files ──
        const form = new FormData();
        form.append("file", file);
        const response = await fetch(`${UPLOAD_URL}/datasets`, {
          method: "POST",
          headers: authHeaders,
          body: form,
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || `Upload gagal (${response.status})`);
        }
        result = await response.json();
      }

      await refreshDatasets();
      await openDataset(result.dataset.metadata.id);
      showToast("File berhasil diupload!", "success");
    } catch (err) {
      showToast(err.message || "Upload gagal.", "error");
    } finally {
      setUploading(false);
    }
  }

  async function handleLocalAnalyze() {
    const id = activeDataset?.metadata?.id;
    if (!id) return;
    setAnalyzing(true);
    setAnalyzeMessage("");
    try {
      const result = await api(`/datasets/${id}/analyze-local`, { method: "POST" });
      setActiveDataset(result.dataset);
      setDatasets((current) =>
        current.map((item) =>
          item.id === id ? { ...item, summary: result.dataset.summary } : item,
        ),
      );
      setAnalyzeMessage("Analisa lokal selesai.");
      showToast("Analisa lokal selesai!", "success");
      navigate("/output");
    } catch (err) {
      showToast(err.message || "Analisa gagal.", "error");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleAiAnalyze() {
    const id = activeDataset?.metadata?.id;
    if (!id) return;
    setAnalyzing(true);
    setAnalyzeMessage("");
    try {
      const result = await api(`/datasets/${id}/analyze`, { method: "POST" });
      setActiveDataset(result.dataset);
      setDatasets((current) =>
        current.map((item) =>
          item.id === id ? { ...item, summary: result.dataset.summary } : item,
        ),
      );
      setAnalyzeMessage("Analisa AI selesai.");
      showToast("Analisa AI selesai!", "success");
      navigate("/output");
    } catch (err) {
      showToast(err.message || "Analisa AI gagal.", "error");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <InputPage
      activeDataset={activeDataset}
      datasets={datasets}
      records={records}
      loading={loading}
      uploading={uploading}
      analyzing={analyzing}
      analyzeMessage={analyzeMessage}
      onUpload={handleUpload}
      onStartLocalAnalyze={handleLocalAnalyze}
      onStartAiAnalyze={handleAiAnalyze}
      onSelectDataset={openDataset}
    />
  );
}

function OutputWrapper() {
  const { api } = useApi();
  const [dataset, setDataset] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLatest();
  }, []);

  async function loadLatest() {
    setLoading(true);
    try {
      const result = await api("/datasets");
      if (result.datasets?.length) {
        const detail = await api(`/datasets/${result.datasets[0].id}`);
        setDataset(detail.dataset);
      }
    } catch (err) {
      // toast already shown
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <section className="empty-state"><h2>Memuat...</h2></section>;
  if (!dataset) return <section className="empty-state"><h2>Belum ada dataset.</h2><p>Upload dan analisa data terlebih dahulu.</p></section>;

  return <OutputPage dataset={dataset} />;
}

function EmployeeDetailWrapper() {
  const { api } = useApi();
  const { showToast } = useToast();
  const [datasets, setDatasets] = useState([]);
  const [activeDataset, setActiveDataset] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [selectedEmployeeKey, setSelectedEmployeeKey] = useState("");
  const [employeeRecords, setEmployeeRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLatest();
  }, []);

  useEffect(() => {
    if (!activeDataset?.metadata?.id || !selectedEmployeeKey) {
      setEmployeeRecords([]);
      return;
    }
    loadEmployeeRecords(activeDataset.metadata.id, selectedEmployeeKey);
  }, [activeDataset?.metadata?.id, selectedEmployeeKey]);

  async function loadLatest() {
    setLoading(true);
    try {
      const result = await api("/datasets");
      if (result.datasets?.length) {
        const detail = await api(`/datasets/${result.datasets[0].id}`);
        setActiveDataset(detail.dataset);
        const employeeList = detail.dataset.employeeReports || [];
        setEmployees(employeeList);
        if (employeeList.length) {
          setSelectedEmployeeKey(employeeList[0].employeeKey);
        }
      }
      setDatasets(result.datasets || []);
    } catch (err) {
      // toast already shown
    } finally {
      setLoading(false);
    }
  }

  async function loadEmployeeRecords(datasetId, employeeKey) {
    try {
      const result = await api(`/datasets/${datasetId}/records?limit=120&employeeKey=${encodeURIComponent(employeeKey)}`);
      setEmployeeRecords(result.records || []);
    } catch (err) {
      // toast already shown
    }
  }

  async function handleExportPdf(datasetId, employeeKey) {
    try {
      showToast("Membuat PDF...", "info");
      const { supabase } = await import("./config/supabase");
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || "";
      // Use direct URL to bypass Vercel proxy timeout for PDF generation
      const response = await fetch(`${UPLOAD_URL}/export/pdf/${datasetId}/${encodeURIComponent(employeeKey)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error("Gagal membuat PDF");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-${employeeKey}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("PDF berhasil diunduh!", "success");
    } catch (err) {
      showToast(err.message || "Export PDF gagal.", "error");
    }
  }

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.employeeKey === selectedEmployeeKey),
    [employees, selectedEmployeeKey],
  );

  const filteredEmployees = useMemo(() => {
    const query = employeeQuery.trim().toLowerCase();
    const list = query
      ? employees.filter(
          (e) =>
            e.employeeKey.includes(query) ||
            e.displayName.toLowerCase().includes(query) ||
            e.department.toLowerCase().includes(query),
        )
      : employees;
    return list.slice().sort((a, b) => b.riskScore - a.riskScore);
  }, [employees, employeeQuery]);

  if (loading) return <section className="empty-state"><h2>Memuat...</h2></section>;
  if (!activeDataset) return <section className="empty-state"><h2>Belum ada dataset.</h2></section>;

  return (
    <EmployeeDetailPage
      dataset={activeDataset}
      employees={filteredEmployees}
      employeeQuery={employeeQuery}
      setEmployeeQuery={setEmployeeQuery}
      selectedEmployee={selectedEmployee}
      selectedEmployeeKey={selectedEmployeeKey}
      setSelectedEmployeeKey={setSelectedEmployeeKey}
      employeeRecords={employeeRecords}
      onExportPdf={handleExportPdf}
    />
  );
}

function AiSettingsWrapper() {
  const { api } = useApi();
  const { showToast } = useToast();
  const [aiConfig, setAiConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadAiConfig();
  }, []);

  async function loadAiConfig() {
    try {
      const result = await api("/ai-config");
      setAiConfig(result.config);
    } catch (err) {
      // toast already shown
    }
  }

  async function handleSave(config) {
    setSaving(true);
    setMessage("");
    try {
      const result = await api("/ai-config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(config),
      });
      setAiConfig(result.config);
      setMessage("Konfigurasi AI tersimpan.");
      showToast("Konfigurasi AI tersimpan!", "success");
    } catch (err) {
      showToast(err.message || "Gagal menyimpan.", "error");
    } finally {
      setSaving(false);
    }
  }

  return <AiSettingsPage config={aiConfig} saving={saving} message={message} onSave={handleSave} />;
}

function HistoryWrapper() {
  const { api } = useApi();
  const navigate = useNavigate();
  const [datasets, setDatasets] = useState([]);
  const [activeDataset, setActiveDataset] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    refreshDatasets();
  }, []);

  async function refreshDatasets() {
    setLoading(true);
    try {
      const result = await api("/datasets");
      setDatasets(result.datasets || []);
      if (result.datasets?.length) {
        const detail = await api(`/datasets/${result.datasets[0].id}`);
        setActiveDataset(detail.dataset);
      }
    } catch (err) {
      // toast already shown
    } finally {
      setLoading(false);
    }
  }

  async function openDataset(id) {
    try {
      const detail = await api(`/datasets/${id}`);
      setActiveDataset(detail.dataset);
      navigate("/output");
    } catch (err) {
      // toast already shown
    }
  }

  if (loading) return <section className="empty-state"><h2>Memuat...</h2></section>;

  return <HistoryPage datasets={datasets} activeDataset={activeDataset} onSelectDataset={openDataset} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<DashboardWrapper />} />
          <Route path="/input" element={<InputWrapper />} />
          <Route path="/output" element={<OutputWrapper />} />
          <Route path="/employee" element={<EmployeeDetailWrapper />} />
          <Route path="/settings" element={<AiSettingsWrapper />} />
          <Route path="/history" element={<HistoryWrapper />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
