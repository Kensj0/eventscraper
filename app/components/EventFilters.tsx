'use client';

export default function EventFilters({
  categories,
  selectedCategory,
  onCategoryChange,
  dateFilter,
  onDateFilterChange,
  dateFilterCounts,
  categoryFilterCounts,
}: {
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  dateFilter: 'today' | 'weekend' | 'all';
  onDateFilterChange: (filter: 'today' | 'weekend' | 'all') => void;
  dateFilterCounts: Record<'today' | 'weekend' | 'all', number>;
  categoryFilterCounts: Record<string, number>;
}) {
  return (
    <div className="mb-8 space-y-4">
      {/* Date Filter */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-700">Datum</h3>
        <div className="flex gap-2">
          {(['today', 'weekend', 'all'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => onDateFilterChange(filter)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                dateFilter === filter
                  ? 'bg-[#B5312F] text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              <span>
                {filter === 'today' && 'Idag'}
                {filter === 'weekend' && 'Helgen'}
                {filter === 'all' && 'Alla'}
              </span>
              <span className={`text-xs tabular-nums ${dateFilter === filter ? 'text-red-100' : 'text-gray-500'}`}>
                {dateFilterCounts[filter]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Category Filter */}
      {categories.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Kategori</h3>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onCategoryChange('')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                selectedCategory === ''
                  ? 'bg-[#B5312F] text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              <span>Alla</span>
              <span className={`text-xs tabular-nums ${selectedCategory === '' ? 'text-red-100' : 'text-gray-500'}`}>
                {categories.reduce((sum, cat) => sum + (categoryFilterCounts[cat] ?? 0), 0) + (categoryFilterCounts[''] ?? 0)}
              </span>
            </button>
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => onCategoryChange(category)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  selectedCategory === category
                    ? 'bg-[#B5312F] text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span>{category}</span>
                <span className={`text-xs tabular-nums ${selectedCategory === category ? 'text-red-100' : 'text-gray-500'}`}>
                  {categoryFilterCounts[category] ?? 0}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
