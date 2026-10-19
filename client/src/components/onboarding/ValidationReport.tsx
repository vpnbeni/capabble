import { Link } from 'react-router-dom';
import { useValidationReport } from '@/hooks/useOnboarding';
import { AlertCircle, CheckCircle, XCircle } from 'lucide-react';

export function ValidationReport() {
  const { data, isLoading, refetch } = useValidationReport();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!data?.report) {
    return (
      <div className="max-w-4xl mx-auto mt-12 p-8 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold mb-4">Validation Report</h1>
        <p className="text-gray-600">No validation report available.</p>
        <button
          onClick={() => refetch()}
          className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Generate Report
        </button>
      </div>
    );
  }

  const { report } = data;
  const { overallStatus, classX, classXII, summary } = report;

  return (
    <div className="max-w-6xl mx-auto mt-8 p-6">
      <h1 className="text-3xl font-bold mb-8">Validation Report</h1>

      {/* Overall Status */}
      <div className="mb-8 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
        <div className="flex items-center mb-4">
          {overallStatus === 'valid' && (
            <CheckCircle className="w-8 h-8 text-green-500 mr-3" />
          )}
          {overallStatus === 'warnings' && (
            <AlertCircle className="w-8 h-8 text-yellow-500 mr-3" />
          )}
          {overallStatus === 'errors' && (
            <XCircle className="w-8 h-8 text-red-500 mr-3" />
          )}
          <div>
            <h2 className="text-2xl font-bold">
              {overallStatus === 'valid' && 'All Validations Passed'}
              {overallStatus === 'warnings' && 'Validation Warnings Found'}
              {overallStatus === 'errors' && 'Validation Errors Found'}
            </h2>
            <p className="text-gray-600">
              Total Candidates: {summary.totalCandidates} | Total Issues: {summary.totalIssues}
            </p>
          </div>
        </div>
      </div>

      {/* Class X Report */}
      <div className="mb-8 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
        <h3 className="text-xl font-bold mb-4">Class X</h3>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-sm text-gray-600">Candidates</p>
            <p className="text-2xl font-bold">{classX.candidateCount}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Issues</p>
            <p className="text-2xl font-bold">
              {classX.candidateCompleteness.totalIssues +
                classX.form66Validation.totalMismatches +
                classX.attendanceValidation.totalMismatches}
            </p>
          </div>
        </div>

        {/* Form 66 Validation */}
        {classX.form66Validation.totalMismatches > 0 && (
          <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <h4 className="font-semibold text-yellow-800 dark:text-yellow-300 mb-2">Form 66 Issues</h4>
            <ul className="list-disc list-inside text-sm text-yellow-700 dark:text-yellow-300">
              <li>Roll Number Mismatches: {classX.form66Validation.summary.rollNumberIssues}</li>
              <li>Subject Mismatches: {classX.form66Validation.summary.subjectIssues}</li>
              <li>Class Mismatches: {classX.form66Validation.summary.classIssues}</li>
            </ul>
          </div>
        )}
      </div>

      {/* Class XII Report */}
      <div className="mb-8 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
        <h3 className="text-xl font-bold mb-4">Class XII</h3>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-sm text-gray-600">Candidates</p>
            <p className="text-2xl font-bold">{classXII.candidateCount}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Issues</p>
            <p className="text-2xl font-bold">
              {classXII.candidateCompleteness.totalIssues +
                classXII.form66Validation.totalMismatches +
                classXII.attendanceValidation.totalMismatches}
            </p>
          </div>
        </div>

        {/* Form 66 Validation */}
        {classXII.form66Validation.totalMismatches > 0 && (
          <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <h4 className="font-semibold text-yellow-800 dark:text-yellow-300 mb-2">Form 66 Issues</h4>
            <ul className="list-disc list-inside text-sm text-yellow-700 dark:text-yellow-300">
              <li>Roll Number Mismatches: {classXII.form66Validation.summary.rollNumberIssues}</li>
              <li>Subject Mismatches: {classXII.form66Validation.summary.subjectIssues}</li>
              <li>Class Mismatches: {classXII.form66Validation.summary.classIssues}</li>
            </ul>
          </div>
        )}
      </div>

      <div className="text-center">
        <Link
          to="/onboarding"
          className="text-blue-600 hover:underline"
        >
          Back to Onboarding
        </Link>
      </div>
    </div>
  );
}
