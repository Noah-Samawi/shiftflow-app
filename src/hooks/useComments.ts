import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { getCurrentOrgId } from "./useOrgId";
import type { Comment } from "../types/database";

interface UseCommentsReturn {
  comments: Comment[];
  loading: boolean;
  error: string | null;
  getComments: (scheduleId: string) => Promise<void>;
  addComment: (scheduleId: string, message: string) => Promise<void>;
}

export function useComments(): UseCommentsReturn {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const getComments = useCallback(async (scheduleId: string) => {
    const orgId = await getCurrentOrgId();
    if (!orgId) {
      setError("Keine Organisation gefunden.");
      setComments([]);
      return;
    }

    setLoading(true);
    setError(null);
    setActiveScheduleId(scheduleId);

    const { data, error: err } = await supabase
      .from("comments")
      .select("*, profiles(id, full_name, avatar_url)")
      .eq("schedule_id", scheduleId)
      .eq("org_id", orgId)
      .order("created_at", { ascending: true });

    if (err) {
      setError(err.message);
    } else {
      setComments(data as Comment[]);
    }
    setLoading(false);
  }, []);

  const addComment = useCallback(
    async (scheduleId: string, message: string) => {
      const orgId = await getCurrentOrgId();
      if (!orgId) {
        throw new Error("Keine Organisation gefunden.");
      }

      setLoading(true);
      setError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error: err } = await supabase.from("comments").insert({
        schedule_id: scheduleId,
        user_id: user?.id,
        message,
        org_id: orgId,
      });

      if (err) {
        setError(err.message);
      } else {
        await getComments(scheduleId);
      }
      setLoading(false);
    },
    [getComments]
  );

  // Realtime: subscribe to the comments channel filtered by the active schedule
  useEffect(() => {
    if (!activeScheduleId) return;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const scheduleId = activeScheduleId;

    const channel = supabase
      .channel(`comments:${scheduleId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comments",
          filter: `schedule_id=eq.${scheduleId}`,
        },
        (payload) => {
          const newComment = payload.new as Comment;
          supabase
            .from("comments")
            .select("*, profiles(id, full_name, avatar_url)")
            .eq("id", newComment.id)
            .single()
            .then(({ data }) => {
              if (data) {
                setComments((prev) => {
                  if (prev.some((c) => c.id === data.id)) return prev;
                  return [...prev, data as Comment];
                });
              }
            });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [activeScheduleId]);

  return { comments, loading, error, getComments, addComment };
}
