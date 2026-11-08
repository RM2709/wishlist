import { type Item } from '@/lib/api';

interface ItemCardProps {
  item: Item;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePriority: () => void;
  onRefreshPrice: () => void;
  isRefreshingPrice: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}

export default function ItemCard({
  item,
  onEdit,
  onDelete,
  onTogglePriority,
  onRefreshPrice,
  isRefreshingPrice,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: ItemCardProps) {
  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded overflow-hidden ${
        item.isPriority
          ? 'border-2 border-green-500 dark:border-green-400'
          : 'border border-gray-200 dark:border-gray-700'
      }`}
    >
      <div className="flex items-stretch">
        {/* Arrow buttons on the left */}
        <div className="flex flex-col w-12 border-r border-gray-200 dark:border-gray-700">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp();
            }}
            disabled={isFirst}
            className="flex-1 flex items-center justify-center text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors border-b border-gray-200 dark:border-gray-700 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move up"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown();
            }}
            disabled={isLast}
            className="flex-1 flex items-center justify-center text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move down"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
        <div className="flex-1 p-4 flex gap-3">
          {/* Image on Left */}
          {item.imageUrl && (
            <img
              src={item.imageUrl}
              alt={item.name}
              className="w-16 h-16 object-cover rounded border border-gray-200 dark:border-gray-600 flex-shrink-0"
            />
          )}
          <div className="flex-1">
            <h5 className="text-base font-semibold text-gray-900 dark:text-white">
              {item.name}
              {item.isPriority && (
                <span className="ml-2 align-middle inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                  ★ Priority
                </span>
              )}
            </h5>
            {item.description && (
              <p className="text-base text-gray-600 dark:text-gray-400 mt-1">
                {item.description}
              </p>
            )}
            {item.price && (
              <p className="text-base text-gray-500 dark:text-gray-400 mt-1">
                {item.price.toFixed(2)} {item.currency}
              </p>
            )}
            {item.autoUpdatePrice && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Auto price update ·{' '}
                {item.priceCheckError ? (
                  <span className="text-red-600 dark:text-red-400">
                    last check failed: {item.priceCheckError}
                  </span>
                ) : item.priceCheckedAt ? (
                  `checked ${new Date(item.priceCheckedAt).toLocaleString()}`
                ) : (
                  'not checked yet'
                )}
                {' · '}
                <button
                  type="button"
                  onClick={onRefreshPrice}
                  disabled={isRefreshingPrice}
                  className="text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer disabled:opacity-50"
                >
                  {isRefreshingPrice ? 'Refreshing...' : 'Refresh now'}
                </button>
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col w-16 border-l border-gray-200 dark:border-gray-700">
          <button
            onClick={onTogglePriority}
            className={`flex-1 flex items-center justify-center transition-colors border-b border-gray-200 dark:border-gray-700 cursor-pointer ${
              item.isPriority
                ? 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30'
                : 'text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
            title={item.isPriority ? 'Remove priority' : 'Mark as priority'}
            aria-pressed={item.isPriority}
          >
            <svg className="w-5 h-5" fill={item.isPriority ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </button>
          <button
            onClick={onEdit}
            className="flex-1 flex items-center justify-center text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-200 dark:border-gray-700 cursor-pointer"
            title="Edit item"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="flex-1 flex items-center justify-center text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors cursor-pointer"
            title="Delete item"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
