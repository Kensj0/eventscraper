'use client';

export default function EventFilters({
  categories,
  selectedCategory,
  onCategoryChange,
  dateFilter,
  onDateFilterChange,
}: {
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  dateFilter: 'today' | 'weekend' | 'all';
  onDateFilterChange: (filter: 'today' | 'weekend' | 'all') => void;
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
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                dateFilter === filter
                  ? 'bg-blue-500 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {filter === 'today' && 'Idag'}
              {filter === 'weekend' && 'Helgen'}
              {filter === 'all' && 'Alla'}
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
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                selectedCategory === ''
                  ? 'bg-blue-500 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              Alla
            </button>
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => onCategoryChange(category)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  selectedCategory === category
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
