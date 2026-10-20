import React, { useState, useEffect } from "react";
import Modal from "./Modal";
import Loader from "./Loader";

export interface ExportFilters {
  [key: string]: any;
}

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  onExport: (filters: ExportFilters, exportAll: boolean) => Promise<void>;
  onFetchPreview: (filters: ExportFilters) => Promise<{ total: number; filtered: number }>;
  filterConfig: {
    label: string;
    key: string;
    type: "text" | "select" | "date" | "number";
    options?: { label: string; value: string }[];
    placeholder?: string;
  }[];
}

const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  title,
  onExport,
  onFetchPreview,
  filterConfig,
}) => {
  const [localFilters, setLocalFilters] = useState<ExportFilters>({});
  const [isExporting, setIsExporting] = useState(false);
  const [dataPreview, setDataPreview] = useState<{ total: number; filtered: number } | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Initialize filters when modal opens
  useEffect(() => {
    if (isOpen) {
      const initialFilters: ExportFilters = {};
      filterConfig.forEach((config) => {
        initialFilters[config.key] = "";
      });
      setLocalFilters(initialFilters);
      fetchPreview({});
    }
  }, [isOpen]);

  // Fetch preview data
  const fetchPreview = async (filters: ExportFilters) => {
    setIsLoadingPreview(true);
    try {
      const preview = await onFetchPreview(filters);
      setDataPreview(preview);
    } catch (error) {
      console.error("Failed to fetch preview:", error);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // Debounced filter change
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      fetchPreview(localFilters);
    }, 500);

    return () => clearTimeout(timer);
  }, [localFilters, isOpen]);

  const handleFilterChange = (key: string, value: any) => {
    setLocalFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleExport = async (exportAll: boolean) => {
    setIsExporting(true);
    try {
      await onExport(exportAll ? {} : localFilters, exportAll);
      onClose();
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleClearFilters = () => {
    const clearedFilters: ExportFilters = {};
    filterConfig.forEach((config) => {
      clearedFilters[config.key] = "";
    });
    setLocalFilters(clearedFilters);
    fetchPreview({});
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      <div className="space-y-6">
        {/* Data Preview */}
        <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg p-4">
          {isLoadingPreview ? (
            <div className="flex items-center justify-center py-4">
              <Loader size="md" />
              <span className="ml-2 text-secondary-600 dark:text-secondary-400">
                Loading preview...
              </span>
            </div>
          ) : dataPreview ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-secondary-600 dark:text-secondary-400">
                  Total Records
                </p>
                <p className="text-2xl font-bold text-primary-600 dark:text-primary-400">
                  {dataPreview.total}
                </p>
              </div>
              <div>
                <p className="text-sm text-secondary-600 dark:text-secondary-400">
                  Filtered Records
                </p>
                <p className="text-2xl font-bold text-primary-600 dark:text-primary-400">
                  {dataPreview.filtered}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* Filters Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">
              Export Filters
            </h3>
            <button
              onClick={handleClearFilters}
              className="btn btn-ghost btn-sm"
              disabled={isExporting}
            >
              <svg
                className="w-4 h-4 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              Clear All
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filterConfig.map((config) => (
              <div key={config.key}>
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                  {config.label}
                </label>
                {config.type === "select" ? (
                  <select
                    value={localFilters[config.key] || ""}
                    onChange={(e) =>
                      handleFilterChange(config.key, e.target.value)
                    }
                    className="input w-full"
                    disabled={isExporting}
                  >
                    <option value="">All</option>
                    {config.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : config.type === "date" ? (
                  <input
                    type="date"
                    value={localFilters[config.key] || ""}
                    onChange={(e) =>
                      handleFilterChange(config.key, e.target.value)
                    }
                    className="input w-full"
                    disabled={isExporting}
                  />
                ) : config.type === "number" ? (
                  <input
                    type="number"
                    value={localFilters[config.key] || ""}
                    onChange={(e) =>
                      handleFilterChange(config.key, e.target.value)
                    }
                    placeholder={config.placeholder}
                    className="input w-full"
                    disabled={isExporting}
                  />
                ) : (
                  <input
                    type="text"
                    value={localFilters[config.key] || ""}
                    onChange={(e) =>
                      handleFilterChange(config.key, e.target.value)
                    }
                    placeholder={config.placeholder}
                    className="input w-full"
                    disabled={isExporting}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Export Actions */}
        <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-secondary-200 dark:border-secondary-700">
          <button
            onClick={() => handleExport(false)}
            className="btn btn-primary flex-1"
            disabled={isExporting}
          >
            {isExporting ? (
              <>
                <Loader size="sm" className="mr-2" />
                Exporting...
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Export Filtered Data
              </>
            )}
          </button>
          <button
            onClick={() => handleExport(true)}
            className="btn btn-outline flex-1"
            disabled={isExporting}
          >
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Export All Data
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ExportModal;
