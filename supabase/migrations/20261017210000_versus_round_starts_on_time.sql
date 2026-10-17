-- ---------------------------------------------------------------------------
-- The next round starts the moment the reveal ends.
--
-- `versus_reconcile` used to stamp each new round from `clock_timestamp()` —
-- the instant the first request arrived *after* `reveal_until_at`. Every
-- client asks at that instant, so the stamp landed one network trip late, and
-- the two players watched a frozen "next round in 0" for that trip (1.5s and
-- more against a database in another hemisphere) before the question appeared.
--
-- Now the round is stamped at `reveal_until_at` itself. That is an instant
-- both browsers already know, so each can put the next question on screen —
-- it is already in their view, its picture already loaded — exactly when the
-- reveal ends, counting down to `reveal_until_at + round_seconds`, while the
-- request that makes it official is still on its way. The server, arriving a
-- trip later, agrees with them to the millisecond: same start, same deadline,
-- and a bot's moment is counted from the same start (its `bot_commit_at` is
-- stamped from `round_started_at` below, as before).
--
-- **Backdated by five seconds at most.** The original stamped from the clock
-- so that an abandoned match plays out at its normal pace instead of flashing
-- through every remaining round in one reconcile. That still holds: a call
-- that arrives more than five seconds after the reveal ended starts the round
-- five seconds ago, which leaves it nearly whole. A client that had drawn the
-- round from `reveal_until_at` then shows a little *less* time than the server
-- allows until its next read corrects it, which is the safe direction.
--
-- Only that one assignment differs from the body in
-- 20261017180000_versus_online.sql; the rest is copied unchanged.
-- ---------------------------------------------------------------------------

create or replace function public.versus_reconcile(p_match_id uuid)
returns public.match
language plpgsql
set search_path = ''
as $$
declare
  v_match public.match;
  v_guard integer := 0;
  v_bot_seat integer;
  v_round public.match_round;
  v_commit_at timestamptz;
  v_answered_at timestamptz;
  v_count integer;
  v_start timestamptz;
begin
  select * into v_match from public.match where id = p_match_id for update;
  if not found then
    raise exception 'match % not found', p_match_id using errcode = 'no_data_found';
  end if;

  -- Only a public match can have a bot, and its seats never change once
  -- filled, so this is read once rather than per transition.
  if v_match.is_public then
    select p.seat into v_bot_seat
    from public.match_player p
    where p.match_id = p_match_id and p.bot_level is not null;
  end if;

  loop
    v_guard = v_guard + 1;
    -- Three transitions per round at the very most, plus slack. A cap rather
    -- than trust: a bug below must not become an unkillable statement.
    exit when v_guard > (v_match.total_rounds * 3) + 4;

    -- When, if at all, the bot's answer to the live round falls due.
    v_commit_at = null;
    if v_bot_seat is not null and v_match.phase = 'playing' then
      select * into v_round
      from public.match_round r
      where r.match_id = v_match.id
        and r.generation = v_match.generation
        and r.idx = v_match.current_idx;

      if found
         and v_round.bot_guess is not null
         and not exists (
           select 1 from public.match_answer a
           where a.match_id = v_match.id
             and a.generation = v_match.generation
             and a.idx = v_match.current_idx
             and a.seat = v_bot_seat
         ) then
        v_commit_at = coalesce(
          v_round.bot_commit_at,
          v_match.round_started_at + v_round.bot_think_ms * interval '1 millisecond'
        );
      end if;
    end if;

    if v_commit_at is not null
       and clock_timestamp() >= v_commit_at
       and v_match.round_deadline_at is not null
       and v_commit_at < v_match.round_deadline_at then
      -- Whether the person has already answered — whether this one is second.
      select count(*) into v_count
      from public.match_answer a
      where a.match_id = v_match.id
        and a.generation = v_match.generation
        and a.idx = v_match.current_idx;

      -- Second, and the round still open: now, the reveal's instant. First, or
      -- the deadline gone by as well (nobody was there to see it): the plan.
      if v_count >= 1 and clock_timestamp() < v_match.round_deadline_at then
        v_answered_at = clock_timestamp();
      else
        v_answered_at = v_commit_at;
      end if;

      insert into public.match_answer (
        match_id, generation, idx, seat,
        guess, verdict, points, elapsed_ms, answered_at
      )
      values (
        v_match.id, v_match.generation, v_match.current_idx, v_bot_seat,
        v_round.bot_guess, v_round.bot_verdict, coalesce(v_round.bot_points, 0),
        -- The same expression versus_submit times a person with.
        greatest(0, round(
          extract(epoch from (v_answered_at - v_match.round_started_at)) * 1000
        ))::integer,
        v_answered_at
      )
      on conflict (match_id, generation, idx, seat) do nothing;

      -- No `answered_count`: a public match never announces a first answer
      -- (versus_submit leaves the row alone for a person's too). The second
      -- closes the round.
      if v_count >= 1 then
        perform public.versus_reveal(v_match);
      end if;

    elsif v_match.phase = 'playing'
       and v_match.round_deadline_at is not null
       and clock_timestamp() >= v_match.round_deadline_at then
      perform public.versus_reveal(v_match);

    elsif v_match.phase = 'revealed'
          and v_match.reveal_until_at is not null
          and clock_timestamp() >= v_match.reveal_until_at then

      if v_match.current_idx + 1 >= v_match.total_rounds then
        update public.match
        set phase = 'complete',
            reveal_until_at = null,
            round_started_at = null,
            round_deadline_at = null
        where id = v_match.id;
      else
        -- The next round starts when the reveal ended, not when somebody
        -- happened to call in after it — backdated by five seconds at most,
        -- so an abandoned match still plays out at its normal pace (see the
        -- header).
        v_start = greatest(
          v_match.reveal_until_at,
          clock_timestamp() - interval '5 seconds'
        );

        update public.match m
        set phase = 'playing',
            current_idx = m.current_idx + 1,
            answered_count = 0,
            round_started_at = v_start,
            round_deadline_at = v_start
              + make_interval(secs => m.round_seconds),
            reveal_until_at = null
        where m.id = v_match.id
        returning * into v_match;

        -- The new round's bot moment, counted from the start just stamped.
        if v_bot_seat is not null then
          update public.match_round r
          set bot_commit_at = v_match.round_started_at
            + r.bot_think_ms * interval '1 millisecond'
          where r.match_id = v_match.id
            and r.generation = v_match.generation
            and r.idx = v_match.current_idx
            and r.bot_think_ms is not null;
        end if;
      end if;

    else
      exit;
    end if;

    select * into v_match from public.match where id = p_match_id;
  end loop;

  return v_match;
end;
$$;

comment on function public.versus_reconcile(uuid) is
  'Applies every deadline that has passed — and, in a public match with a bot, '
  'writes the bot''s answer once its moment has passed (unannounced if first, '
  'revealing if second). Run at the head of every entry point, so the match '
  'state never depends on a client having called in.';
