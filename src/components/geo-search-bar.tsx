"use client";

import { useEffect, useRef, useState } from "react";
import { getGeoSuggestions, GeoSuggestion, resolveGeoQuery, ResolvedGeoQuery } from "@/lib/geo-data";

interface GeoSearchBarProps {
  onSearchChange: (query: string, resolved: ResolvedGeoQuery | null) => void;
  onProspectLocation?: (resolved: ResolvedGeoQuery) => void;
  placeholder?: string;
  initialValue?: string;
}

export function GeoSearchBar({
  onSearchChange,
  onProspectLocation,
  placeholder = "Search by Town, County, or Zip Code (e.g. Great Neck, Nassau County, 11023)...",
  initialValue = "",
}: GeoSearchBarProps) {
  const [query, setQuery] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeResolved, setActiveResolved] = useState<ResolvedGeoQuery | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      setActiveResolved(null);
      onSearchChange("", null);
      return;
    }

    const sugs = getGeoSuggestions(query);
    setSuggestions(sugs);

    const resolved = resolveGeoQuery(query);
    setActiveResolved(resolved);
    onSearchChange(query, resolved);
  }, [query, onSearchChange]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function selectSuggestion(s: GeoSuggestion) {
    setQuery(s.value);
    setIsOpen(false);
  }

  function handleClear() {
    setQuery("");
    setSuggestions([]);
    setIsOpen(false);
    onSearchChange("", null);
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-3xl">
      <div className="relative flex items-center shadow-sm rounded-xl border border-slate-200 bg-white focus-within:border-cyan-500 focus-within:ring-2 focus-within:ring-cyan-500/20 transition-all">
        {/* Search Icon */}
        <div className="pl-4 pr-2 text-slate-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {/* Input */}
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full py-3.5 pr-24 pl-1 text-slate-900 text-sm placeholder-slate-400 bg-transparent focus:outline-none"
        />

        {/* Category Pill / Action Badges */}
        <div className="absolute right-3 flex items-center gap-2">
          {activeResolved && (
            <span
              className={`px-2.5 py-1 text-xs font-semibold rounded-md uppercase tracking-wider ${
                activeResolved.type === "zip"
                  ? "bg-amber-100 text-amber-800"
                  : activeResolved.type === "county"
                  ? "bg-emerald-100 text-emerald-800"
                  : activeResolved.type === "town"
                  ? "bg-blue-100 text-blue-800"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {activeResolved.type}
            </span>
          )}

          {query && (
            <button
              onClick={handleClear}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
              title="Clear search"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Autocomplete Dropdown */}
      {isOpen && (suggestions.length > 0 || (activeResolved && activeResolved.towns.length > 0)) && (
        <div className="absolute z-50 left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden divide-y divide-slate-100 animate-in fade-in slide-in-from-top-2 duration-150">
          {suggestions.length > 0 && (
            <div className="p-2">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Matching Geo Locations
              </div>
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => selectSuggestion(s)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 flex items-center justify-between group transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="p-1.5 rounded-md bg-slate-100 text-slate-600 group-hover:bg-cyan-100 group-hover:text-cyan-700 transition-colors">
                      {s.type === "zip" ? "📮" : s.type === "county" ? "🗺️" : "🏙️"}
                    </span>
                    <div>
                      <div className="text-sm font-medium text-slate-800">{s.label}</div>
                      <div className="text-xs text-slate-500">{s.sublabel}</div>
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 group-hover:text-cyan-600 font-medium">Select →</span>
                </button>
              ))}
            </div>
          )}

          {activeResolved && onProspectLocation && (
            <div className="p-3 bg-slate-50 flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-slate-700">
                  Targeting: <span className="font-semibold text-slate-900">{activeResolved.primaryLabel}</span>
                </div>
                <div className="text-[11px] text-slate-500">
                  {activeResolved.towns.length} town(s) matched ({activeResolved.towns.slice(0, 3).join(", ")}...)
                </div>
              </div>

              <button
                onClick={() => {
                  onProspectLocation(activeResolved);
                  setIsOpen(false);
                }}
                className="px-3 py-1.5 text-xs font-semibold bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
              >
                <span>⚡ Prospect This Location</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
