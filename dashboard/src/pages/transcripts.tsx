import { useState, useMemo } from 'react';
import {
  Search,
  MessageSquare,
  User,
  Bot,
  Terminal,
  Loader2,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Clock,
  Hash,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import {
  useTranscriptSearch,
  useTranscriptList,
  useTranscriptLoad,
} from '@/api/hooks';
import type {
  TranscriptSnippet,
  TranscriptMessage,
  TranscriptRole,
  TranscriptRecord,
  TranscriptStatus,
} from '@/api/types';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const roleConfig: Record<TranscriptRole, { label: string; icon: typeof User; color: string }> = {
  user: { label: 'User', icon: User, color: 'text-blue-400' },
  assistant: { label: 'Assistant', icon: Bot, color: 'text-purple-400' },
  system: { label: 'System', icon: Terminal, color: 'text-yellow-400' },
  tool_use: { label: 'Tool Use', icon: Terminal, color: 'text-green-400' },
  tool_result: { label: 'Tool Result', icon: Terminal, color: 'text-cyan-400' },
};

const statusColors: Record<TranscriptStatus, 'default' | 'info-pulse' | 'success-subtle' | 'secondary'> = {
  active: 'info-pulse',
  ended: 'success-subtle',
  extracted: 'secondary',
};

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelativeDate(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDateTime(dateString);
}

// ---------------------------------------------------------------------------
// Message bubble (shared between search and load views)
// ---------------------------------------------------------------------------

function MessageBubble({
  message,
  isMatch,
}: {
  message: TranscriptMessage;
  isMatch: boolean;
}) {
  const config = roleConfig[message.role] ?? roleConfig.user;
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'flex gap-3 p-3 rounded-lg transition-colors',
        isMatch ? 'bg-primary/10 ring-1 ring-primary/30' : 'bg-muted/30'
      )}
    >
      <div className={cn('shrink-0 mt-0.5', config.color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className={cn('text-xs font-medium', config.color)}>
            {config.label}
          </span>
          {message.toolName && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {message.toolName}
            </Badge>
          )}
          {isMatch && (
            <Badge variant="default" className="text-[10px] px-1.5 py-0">
              Match
            </Badge>
          )}
        </div>
        <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
          {message.content.length > 500
            ? message.content.slice(0, 500) + '...'
            : message.content}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search snippet card
// ---------------------------------------------------------------------------

function SnippetCard({ snippet }: { snippet: TranscriptSnippet }) {
  const [expanded, setExpanded] = useState(false);
  const visibleMessages = expanded
    ? snippet.messages
    : snippet.messages.slice(0, 4);

  return (
    <div className="glass rounded-xl overflow-hidden border border-white/5">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-muted/20">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-mono text-muted-foreground">
            {snippet.transcriptId.slice(0, 12)}...
          </span>
          {snippet.transcript.createdAt && (
            <span className="text-xs text-muted-foreground">
              {formatDateTime(snippet.transcript.createdAt)}
            </span>
          )}
        </div>
        <Badge variant="secondary" className="text-xs">
          Score: {snippet.score.toFixed(2)}
        </Badge>
      </div>

      <div className="p-3 space-y-2">
        {visibleMessages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isMatch={msg.id === snippet.matchedMessageId}
          />
        ))}

        {snippet.messages.length > 4 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-4 w-4 mr-1" /> Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-1" /> Show{' '}
                {snippet.messages.length - 4} more messages
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline row
// ---------------------------------------------------------------------------

function TimelineRow({
  transcript,
  onOpen,
}: {
  transcript: TranscriptRecord;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="w-full text-left glass rounded-xl p-4 border border-white/5 hover:border-primary/20 transition-all group"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="shrink-0 w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center">
            <MessageSquare className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">
              {transcript.claudeSessionId.slice(0, 20)}...
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatRelativeDate(transcript.createdAt)}
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Hash className="h-3 w-3" />
                {transcript.messageCount} msgs
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {transcript.agentId && (
            <Badge variant="secondary" className="text-xs">
              {transcript.agentId}
            </Badge>
          )}
          <Badge variant={statusColors[transcript.status]}>
            {transcript.status}
          </Badge>
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Transcript detail modal (loads full messages)
// ---------------------------------------------------------------------------

function TranscriptDetail({
  transcriptId,
}: {
  transcriptId: string;
}) {
  const { data, isLoading, error } = useTranscriptLoad(transcriptId);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">Loading messages...</p>
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-destructive text-sm py-4">{error.message}</p>
    );
  }

  const messages = data?.messages ?? [];

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      {data?.transcript && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground pb-2 border-b border-white/5">
          <span>{data.totalMessages} total messages</span>
          <span>Session: {(data.transcript as unknown as TranscriptRecord).claudeSessionId?.slice(0, 16) ?? transcriptId.slice(0, 16)}...</span>
        </div>
      )}

      {messages.length > 0 ? (
        <div className="space-y-2">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} isMatch={false} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-8">
          No messages in this transcript
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search view
// ---------------------------------------------------------------------------

function SearchView() {
  const [searchInput, setSearchInput] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [contextWindow, setContextWindow] = useState(2);

  const searchOptions = useMemo(
    () => ({ contextWindow, limit: 20 }),
    [contextWindow]
  );

  const { data, isLoading, error } = useTranscriptSearch(
    submittedQuery,
    searchOptions,
    submittedQuery.length >= 2
  );

  const results = useMemo(() => data?.results ?? [], [data]);

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmittedQuery(searchInput.trim());
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search transcripts..."
            className="pl-10"
          />
        </div>
        <select
          value={contextWindow}
          onChange={(e) => setContextWindow(Number(e.target.value))}
          className="bg-muted border border-border rounded-md px-3 py-2 text-sm"
        >
          <option value={1}>1 msg context</option>
          <option value={2}>2 msg context</option>
          <option value={3}>3 msg context</option>
          <option value={5}>5 msg context</option>
        </select>
        <Button type="submit" disabled={searchInput.trim().length < 2}>
          <Search className="h-4 w-4 mr-2" />
          Search
        </Button>
      </form>

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Searching transcripts...
          </p>
        </div>
      )}

      {error && (
        <p className="text-destructive font-medium text-center py-8">
          {error.message}
        </p>
      )}

      {!isLoading && !error && submittedQuery && (
        <>
          <p className="text-sm text-muted-foreground">
            {data?.totalCount ?? 0} result
            {(data?.totalCount ?? 0) !== 1 ? 's' : ''} for &quot;
            {submittedQuery}&quot;
          </p>

          {results.length > 0 ? (
            <div className="space-y-4">
              {results.map((snippet, idx) => (
                <SnippetCard
                  key={`${snippet.transcriptId}-${idx}`}
                  snippet={snippet}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">
                No transcripts match your search
              </p>
            </div>
          )}
        </>
      )}

      {!submittedQuery && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <MessageSquare className="h-12 w-12 text-muted-foreground/20 mb-3" />
          <p className="text-muted-foreground">
            Enter a query to search conversation history
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline view
// ---------------------------------------------------------------------------

function TimelineView() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const listOptions = useMemo(() => ({ limit, offset }), [offset]);
  const { data, isLoading, error } = useTranscriptList(listOptions);

  const transcripts = data?.transcripts ?? [];
  const totalCount = data?.totalCount ?? 0;
  const hasMore = offset + limit < totalCount;

  if (isLoading && transcripts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">
          Loading transcripts...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-destructive font-medium text-center py-8">
        {error.message}
      </p>
    );
  }

  return (
    <>
      {transcripts.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {totalCount} conversation{totalCount !== 1 ? 's' : ''} recorded
          </p>

          {transcripts.map((t) => (
            <TimelineRow
              key={t.id}
              transcript={t}
              onOpen={() => setSelectedId(t.id)}
            />
          ))}

          {/* Pagination */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset((prev) => Math.max(0, prev - limit))}
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              {offset + 1}–{Math.min(offset + limit, totalCount)} of{' '}
              {totalCount}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={!hasMore}
              onClick={() => setOffset((prev) => prev + limit)}
            >
              Next <ArrowLeft className="h-4 w-4 ml-1 rotate-180" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <MessageSquare className="h-12 w-12 text-muted-foreground/20 mb-3" />
          <p className="text-muted-foreground">No transcripts recorded yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Transcripts are captured automatically during Claude Code sessions
          </p>
        </div>
      )}

      <Modal
        isOpen={selectedId !== null}
        onClose={() => setSelectedId(null)}
        title="Conversation"
        size="2xl"
      >
        {selectedId && <TranscriptDetail transcriptId={selectedId} />}
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main page — tabs for Timeline / Search
// ---------------------------------------------------------------------------

export function TranscriptsPage() {
  const [tab, setTab] = useState<'timeline' | 'search'>('timeline');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Transcripts</h1>
        <p className="text-muted-foreground">
          Browse and search conversation history across all sessions
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-white/5 pb-0">
        <button
          onClick={() => setTab('timeline')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
            tab === 'timeline'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Clock className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          Timeline
        </button>
        <button
          onClick={() => setTab('search')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
            tab === 'search'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Search className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          Search
        </button>
      </div>

      {tab === 'timeline' ? <TimelineView /> : <SearchView />}
    </div>
  );
}
