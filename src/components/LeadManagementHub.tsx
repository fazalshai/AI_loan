import React, { useState, useEffect, useMemo } from 'react';
import { 
  UploadCloud, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  PhoneCall, 
  CheckSquare, 
  Square, 
  Sparkles, 
  Database, 
  Building2, 
  CreditCard,
  RefreshCw,
  SlidersHorizontal,
  X
} from 'lucide-react';

interface LeadManagementHubProps {
  onProceedToCall: (lead: any, agentType: 'real_estate' | 'loan') => void;
  backendUrl?: string;
}

export const LeadManagementHub: React.FC<LeadManagementHubProps> = ({ onProceedToCall, backendUrl = '' }) => {
  const [datasetType, setDatasetType] = useState<'real_estate' | 'loan'>('real_estate');
  const [leads, setLeads] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNationality, setSelectedNationality] = useState<string>('all');
  const [selectedPropertyType, setSelectedPropertyType] = useState<string>('all');
  const [selectedAgeRange, setSelectedAgeRange] = useState<string>('all');
  const [selectedRiskLevel, setSelectedRiskLevel] = useState<string>('all');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Selection State
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  // Load Dataset from Backend or Sample
  const fetchDataset = async (type: 'real_estate' | 'loan') => {
    setIsLoading(true);
    setFileName(null);
    setSelectedLeadId(null);
    try {
      const cleanUrl = backendUrl.trim().replace(/\/+$/, '');
      const response = await fetch(`${cleanUrl}/api/data?agent=${type}`);
      const result = await response.json();
      if (result.data) {
        setLeads(result.data);
      }
    } catch (e) {
      console.error("Error fetching dataset:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDataset(datasetType);
    setCurrentPage(1);
  }, [datasetType]);

  // Handle Drag & Drop / File Upload
  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const cleanUrl = backendUrl.trim().replace(/\/+$/, '');
      const response = await fetch(`${cleanUrl}/api/upload-leads`, {
        method: 'POST',
        body: formData
      });
      const result = await response.json();
      if (result.data) {
        setLeads(result.data);
        setFileName(result.filename || file.name);
        setCurrentPage(1);
        setSelectedLeadId(null);
      } else if (result.error) {
        alert(result.error);
      }
    } catch (err) {
      console.error("Upload error:", err);
      alert("Failed to parse file. Make sure your backend server is running.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // Derive unique nationalities for filter dropdown
  const uniqueNationalities = useMemo(() => {
    const list = new Set<string>();
    leads.forEach(l => {
      const nat = l.Nationality || l.nationality || l.developer || l.area;
      if (nat) list.add(String(nat));
    });
    return Array.from(list).sort();
  }, [leads]);

  // Derive unique property types / areas
  const uniquePropertyTypes = useMemo(() => {
    const list = new Set<string>();
    leads.forEach(l => {
      const t = l.type || l.Property_Type || l.area;
      if (t) list.add(String(t));
    });
    return Array.from(list).sort();
  }, [leads]);

  // Filtered Leads Calculation
  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = String(lead.id || lead.Customer_ID || lead.developer || '').toLowerCase().includes(q);
        const matchesArea = String(lead.area || lead.Property_Area || lead.type || '').toLowerCase().includes(q);
        const matchesNat = String(lead.Nationality || '').toLowerCase().includes(q);
        if (!matchesName && !matchesArea && !matchesNat) return false;
      }

      // 2. Nationality Filter
      if (selectedNationality !== 'all') {
        const nat = String(lead.Nationality || lead.nationality || lead.developer || lead.area || '');
        if (nat !== selectedNationality) return false;
      }

      // 3. Property Type Filter
      if (selectedPropertyType !== 'all') {
        const type = String(lead.type || lead.Property_Type || lead.area || '');
        if (type !== selectedPropertyType) return false;
      }

      // 4. Age Range Filter
      if (selectedAgeRange !== 'all' && lead.Age) {
        const age = Number(lead.Age);
        if (selectedAgeRange === '20-30' && (age < 20 || age > 30)) return false;
        if (selectedAgeRange === '31-40' && (age < 31 || age > 40)) return false;
        if (selectedAgeRange === '41-50' && (age < 41 || age > 50)) return false;
        if (selectedAgeRange === '50+' && age <= 50) return false;
      }

      // 5. Risk / Loan Status Filter
      if (selectedRiskLevel !== 'all') {
        const status = String(lead.Loan_Approved || lead.Risk_Level || lead.metro || '');
        if (status !== selectedRiskLevel) return false;
      }

      return true;
    });
  }, [leads, searchQuery, selectedNationality, selectedPropertyType, selectedAgeRange, selectedRiskLevel]);

  // Paginated Slice
  const totalPages = Math.ceil(filteredLeads.length / pageSize) || 1;
  const paginatedLeads = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLeads.slice(start, start + pageSize);
  }, [filteredLeads, currentPage, pageSize]);

  // Get currently selected lead object
  const selectedLead = useMemo(() => {
    if (!selectedLeadId) return null;
    return leads.find(l => String(l.id || l.Customer_ID) === selectedLeadId) || null;
  }, [leads, selectedLeadId]);

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedNationality('all');
    setSelectedPropertyType('all');
    setSelectedAgeRange('all');
    setSelectedRiskLevel('all');
    setCurrentPage(1);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', maximumFractionDigits: 0 }).format(val);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Top Header Card */}
      <div className="glass-panel" style={{ padding: '2rem', borderRadius: '16px', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute',
          top: '-50px',
          right: '-50px',
          width: '250px',
          height: '250px',
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div>
            <span className="badge" style={{ marginBottom: '0.5rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={13} /> Enterprise CRM Data Hub
            </span>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', margin: '0.25rem 0' }}>
              Client Lead Intelligence & Campaign Trigger
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', maxWidth: '650px' }}>
              Upload your company Excel/CSV client records, apply multi-dimensional filters, select target buyers or borrowers, and launch AI Agent call campaigns.
            </p>
          </div>

          {/* Dataset Selector Tabs */}
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-glass)' }}>
            <button
              onClick={() => setDatasetType('real_estate')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: datasetType === 'real_estate' ? 'var(--primary)' : 'transparent',
                color: datasetType === 'real_estate' ? '#fff' : 'var(--text-muted)',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'var(--transition-smooth)'
              }}
            >
              <Building2 size={16} /> Real Estate Buyers
            </button>
            <button
              onClick={() => setDatasetType('loan')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: datasetType === 'loan' ? 'var(--secondary)' : 'transparent',
                color: datasetType === 'loan' ? '#fff' : 'var(--text-muted)',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'var(--transition-smooth)'
              }}
            >
              <CreditCard size={16} /> Loan Applicants
            </button>
          </div>
        </div>

        {/* Upload Zone & Quick Sample Loaders */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.2rem', marginTop: '1.8rem' }}>
          
          {/* Drag & Drop Upload Box */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            style={{
              border: '2px dashed rgba(139, 92, 246, 0.35)',
              background: 'rgba(139, 92, 246, 0.04)',
              borderRadius: '12px',
              padding: '1.2rem 1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              transition: 'var(--transition-smooth)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: 'rgba(139, 92, 246, 0.15)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <UploadCloud size={22} />
              </div>
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#fff' }}>
                  {fileName ? `Loaded: ${fileName}` : "Upload Custom File (.xlsx, .csv)"}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Drag & drop file here or click to browse
                </div>
              </div>
            </div>

            <label style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid var(--border-glass)',
              borderRadius: '8px',
              padding: '6px 14px',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: '#fff',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}>
              {isUploading ? "Uploading..." : "Browse File"}
              <input
                type="file"
                accept=".csv, .xlsx, .xls"
                style={{ display: 'none' }}
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              />
            </label>
          </div>

          {/* Preset Buttons */}
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid var(--border-glass)',
            borderRadius: '12px',
            padding: '1.2rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem'
          }}>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Database size={16} style={{ color: 'var(--secondary)' }} /> Sample Enterprise Datasets
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Pre-loaded synthetic Dubai datasets (200 records each)
              </div>
            </div>

            <button
              onClick={() => fetchDataset(datasetType)}
              disabled={isLoading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(6, 182, 212, 0.12)',
                border: '1px solid rgba(6, 182, 212, 0.3)',
                color: '#38bdf8',
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={13} className={isLoading ? "spin" : ""} /> Reload Sample
            </button>
          </div>

        </div>
      </div>

      {/* Filter & Control Toolbar */}
      <div className="glass-panel" style={{ padding: '1.2rem 1.5rem', borderRadius: '14px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* Top Bar: Search & Quick Stats */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            
            {/* Search Input */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid var(--border-glass)',
              borderRadius: '8px',
              padding: '8px 14px',
              width: '100%',
              maxWidth: '360px'
            }}>
              <Search size={16} style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search Name, Area, ID, or Developer..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#fff',
                  fontSize: '0.85rem',
                  width: '100%'
                }}
              />
              {searchQuery && (
                <X size={14} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setSearchQuery('')} />
              )}
            </div>

            {/* Stats Badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <span>Total Loaded: <strong style={{ color: '#fff' }}>{leads.length}</strong></span>
              <span>•</span>
              <span>Matching Filters: <strong style={{ color: 'var(--primary)' }}>{filteredLeads.length}</strong></span>
            </div>
          </div>

          {/* Multi-Criteria Filters Row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '0.8rem',
            paddingTop: '0.8rem',
            borderTop: '1px solid rgba(255,255,255,0.06)'
          }}>

            {/* Filter 1: Nationality / Area */}
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                NATIONALITY / LOCATION
              </label>
              <select
                value={selectedNationality}
                onChange={(e) => { setSelectedNationality(e.target.value); setCurrentPage(1); }}
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  color: '#fff',
                  fontSize: '0.8rem',
                  outline: 'none'
                }}
              >
                <option value="all">All Nationalities / Areas</option>
                {uniqueNationalities.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            {/* Filter 2: Property Type */}
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                PROPERTY / GOAL TYPE
              </label>
              <select
                value={selectedPropertyType}
                onChange={(e) => { setSelectedPropertyType(e.target.value); setCurrentPage(1); }}
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  color: '#fff',
                  fontSize: '0.8rem',
                  outline: 'none'
                }}
              >
                <option value="all">All Types</option>
                {uniquePropertyTypes.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Filter 3: Age Range */}
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                AGE GROUP
              </label>
              <select
                value={selectedAgeRange}
                onChange={(e) => { setSelectedAgeRange(e.target.value); setCurrentPage(1); }}
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  color: '#fff',
                  fontSize: '0.8rem',
                  outline: 'none'
                }}
              >
                <option value="all">All Ages</option>
                <option value="20-30">20 - 30 Years</option>
                <option value="31-40">31 - 40 Years</option>
                <option value="41-50">41 - 50 Years</option>
                <option value="50+">50+ Years</option>
              </select>
            </div>

            {/* Filter 4: Risk / Status */}
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                STATUS / ACCESSIBILITY
              </label>
              <select
                value={selectedRiskLevel}
                onChange={(e) => { setSelectedRiskLevel(e.target.value); setCurrentPage(1); }}
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  color: '#fff',
                  fontSize: '0.8rem',
                  outline: 'none'
                }}
              >
                <option value="all">All Statuses</option>
                <option value="Yes">Approved / Metro Accessible</option>
                <option value="No">Under Review / No Metro</option>
                <option value="Low">Low Risk</option>
                <option value="Medium">Medium Risk</option>
                <option value="High">High Risk</option>
              </select>
            </div>

            {/* Reset Button */}
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                onClick={resetFilters}
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  color: 'var(--text-muted)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <SlidersHorizontal size={13} /> Reset Filters
              </button>
            </div>

          </div>

        </div>
      </div>

      {/* Main Paginated Data Table */}
      <div className="glass-panel" style={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--border-glass)' }}>
        
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid var(--border-glass)' }}>
                <th style={{ padding: '14px 16px', width: '40px' }}>Select</th>
                {datasetType === 'real_estate' ? (
                  <>
                    <th style={{ padding: '14px 16px' }}>Property ID / Area</th>
                    <th style={{ padding: '14px 16px' }}>Property Type</th>
                    <th style={{ padding: '14px 16px' }}>Bed / Bath</th>
                    <th style={{ padding: '14px 16px' }}>Price (AED)</th>
                    <th style={{ padding: '14px 16px' }}>Rental Yield</th>
                    <th style={{ padding: '14px 16px' }}>Developer</th>
                    <th style={{ padding: '14px 16px' }}>Metro Access</th>
                  </>
                ) : (
                  <>
                    <th style={{ padding: '14px 16px' }}>Customer ID</th>
                    <th style={{ padding: '14px 16px' }}>Nationality</th>
                    <th style={{ padding: '14px 16px' }}>Age</th>
                    <th style={{ padding: '14px 16px' }}>Monthly Salary</th>
                    <th style={{ padding: '14px 16px' }}>Credit Score</th>
                    <th style={{ padding: '14px 16px' }}>Monthly EMI</th>
                    <th style={{ padding: '14px 16px' }}>Loan Status</th>
                  </>
                )}
                <th style={{ padding: '14px 16px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Loading lead dataset...
                  </td>
                </tr>
              ) : paginatedLeads.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No leads match the selected filter criteria. Try resetting filters.
                  </td>
                </tr>
              ) : (
                paginatedLeads.map((lead, idx) => {
                  const leadId = String(lead.id || lead.Customer_ID);
                  const isSelected = selectedLeadId === leadId;

                  return (
                    <tr
                      key={leadId || idx}
                      onClick={() => setSelectedLeadId(isSelected ? null : leadId)}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                        background: isSelected ? 'rgba(139, 92, 246, 0.12)' : 'transparent',
                        cursor: 'pointer',
                        transition: 'var(--transition-smooth)'
                      }}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        {isSelected ? (
                          <CheckSquare size={18} style={{ color: 'var(--primary)' }} />
                        ) : (
                          <Square size={18} style={{ color: 'var(--text-muted)' }} />
                        )}
                      </td>

                      {datasetType === 'real_estate' ? (
                        <>
                          <td style={{ padding: '12px 16px', fontWeight: 600, color: '#fff' }}>
                            {lead.Property_ID || lead.id} — {lead.Area || lead.area}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: 'rgba(255,255,255,0.06)',
                              fontSize: '0.75rem'
                            }}>
                              {lead.Property_Type || lead.type}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            {lead.Bedrooms ?? lead.bedrooms} Bed / {lead.Bathrooms ?? lead.bathrooms} Bath
                          </td>
                          <td style={{ padding: '12px 16px', fontWeight: 700, color: '#34d399' }}>
                            {formatCurrency(Number(lead.Price_AED || lead.price || 0))}
                          </td>
                          <td style={{ padding: '12px 16px', color: 'var(--secondary)' }}>
                            {lead['Rental_Yield_%'] || lead.yield}% p.a.
                          </td>
                          <td style={{ padding: '12px 16px' }}>{lead.Developer || lead.developer}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: (lead.Metro_Access || lead.metro) === 'Yes' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                              color: (lead.Metro_Access || lead.metro) === 'Yes' ? '#34d399' : '#fb7185',
                              fontSize: '0.75rem',
                              fontWeight: 600
                            }}>
                              {(lead.Metro_Access || lead.metro) === 'Yes' ? 'Direct Metro' : 'No Metro'}
                            </span>
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ padding: '12px 16px', fontWeight: 600, color: '#fff' }}>
                            {lead.Customer_ID}
                          </td>
                          <td style={{ padding: '12px 16px' }}>{lead.Nationality || 'Dubai Lead'}</td>
                          <td style={{ padding: '12px 16px' }}>{lead.Age} Yrs</td>
                          <td style={{ padding: '12px 16px', fontWeight: 700, color: '#38bdf8' }}>
                            {formatCurrency(Number(lead.Monthly_Salary_AED || lead.Monthly_Salary || 0))}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{
                              fontWeight: 700,
                              color: Number(lead.Credit_Score) >= 720 ? '#34d399' : Number(lead.Credit_Score) >= 650 ? '#fbbf24' : '#fb7185'
                            }}>
                              {lead.Credit_Score}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            {formatCurrency(Number(lead.Monthly_EMI_AED || 0))}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: lead.Loan_Approved === 'Yes' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                              color: lead.Loan_Approved === 'Yes' ? '#34d399' : '#fb7185',
                              fontSize: '0.75rem',
                              fontWeight: 600
                            }}>
                              {lead.Loan_Approved === 'Yes' ? 'Approved' : 'In Review'}
                            </span>
                          </td>
                        </>
                      )}

                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onProceedToCall(lead, datasetType);
                          }}
                          style={{
                            background: 'var(--gradient-primary)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '5px 12px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <PhoneCall size={12} /> Call Lead
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer: Pagination Controls */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 20px',
          background: 'rgba(0,0,0,0.3)',
          borderTop: '1px solid var(--border-glass)',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          
          {/* Page Size Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--border-glass)',
                borderRadius: '6px',
                padding: '4px 8px',
                color: '#fff',
                fontSize: '0.8rem',
                outline: 'none'
              }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>

          {/* Showing Count */}
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Showing {filteredLeads.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} to {Math.min(currentPage * pageSize, filteredLeads.length)} of {filteredLeads.length} entries
          </div>

          {/* Pagination Navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--border-glass)',
                color: currentPage === 1 ? 'rgba(255,255,255,0.2)' : '#fff',
                borderRadius: '6px',
                padding: '5px 10px',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <ChevronLeft size={16} />
            </button>

            <span style={{ fontSize: '0.85rem', color: '#fff', padding: '0 8px', fontWeight: 600 }}>
              Page {currentPage} of {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--border-glass)',
                color: currentPage === totalPages ? 'rgba(255,255,255,0.2)' : '#fff',
                borderRadius: '6px',
                padding: '5px 10px',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>

        </div>

      </div>

      {/* Floating Campaign Action Bar when a Lead is Selected */}
      {selectedLead && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(139, 92, 246, 0.4)',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5), 0 0 20px rgba(139, 92, 246, 0.2)',
          borderRadius: '16px',
          padding: '1rem 1.8rem',
          display: 'flex',
          alignItems: 'center',
          gap: '2rem',
          maxWidth: '90vw',
          animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', letterSpacing: '0.5px' }}>
              SELECTED CANDIDATE FOR AI CALL
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
              {selectedLead.Property_ID || selectedLead.id || selectedLead.Customer_ID} — {selectedLead.Area || selectedLead.area || selectedLead.Nationality || "Dubai Client"}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {datasetType === 'real_estate' ? (
                `Price: ${formatCurrency(Number(selectedLead.Price_AED || selectedLead.price || 0))} • ${selectedLead.Property_Type || selectedLead.type} (${selectedLead.Bedrooms ?? selectedLead.bedrooms} Bed)`
              ) : (
                `Salary: ${formatCurrency(Number(selectedLead.Monthly_Salary_AED || selectedLead.Monthly_Salary || 0))} • Credit Score: ${selectedLead.Credit_Score}`
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              onClick={() => setSelectedLeadId(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              Deselect
            </button>

            <button
              onClick={() => onProceedToCall(selectedLead, datasetType)}
              style={{
                background: 'var(--gradient-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                padding: '10px 20px',
                fontSize: '0.9rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 0 15px rgba(139, 92, 246, 0.4)'
              }}
            >
              <PhoneCall size={16} /> Proceed to Call Campaign →
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
