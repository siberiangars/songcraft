import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import prisma from "@/lib/prisma";
import { BOT_USERNAME, PUBLIC_BASE_URL } from "@/lib/songcraft/config";
import { SharedTrackPlayer } from "@/components/songcraft/SharedTrackPlayer";
import styles from "./track.module.css";

export const dynamic = "force-dynamic";

async function findTrack(token: string) {
  return prisma.song.findUnique({
    where: { shareToken: token },
    select: {
      title: true,
      audioUrl: true,
      imageUrl: true,
      duration: true,
      shareToken: true,
      order: { select: { recipientName: true } },
    },
  });
}

function absoluteUrl(value: string | null) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `${PUBLIC_BASE_URL()}${value.startsWith("/") ? "" : "/"}${value}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const song = await findTrack((await params).token);
  if (!song) return { title: "Трек не найден" };
  const image = absoluteUrl(song.imageUrl);
  return {
    title: `${song.title} | SongCraft`,
    description: "Персональный трек, созданный специально для важного человека.",
    openGraph: {
      title: song.title,
      description: "Для тебя создали персональный трек. Нажми, чтобы послушать.",
      type: "music.song",
      images: image ? [{ url: image }] : undefined,
    },
  };
}

export default async function SharedTrackPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const song = await findTrack((await params).token);
  if (!song) notFound();

  return (
    <main className={styles.page}>
      {song.imageUrl && (
        <div
          className={styles.backdrop}
          style={{ backgroundImage: `url("${song.imageUrl.replace(/"/g, "%22")}")` }}
          aria-hidden="true"
        />
      )}
      <section className={styles.content}>
        <header className={styles.brand}>
          <span>SongCraft</span>
          <strong>ТВОЙ ТРЕК</strong>
        </header>
        <div className={styles.cover}>
          {song.imageUrl ? (
            <Image
              src={song.imageUrl}
              alt={`Обложка трека ${song.title}`}
              fill
              sizes="(max-width: 480px) 74vw, 320px"
              unoptimized
            />
          ) : <span>♪</span>}
        </div>
        <div className={styles.copy}>
          <span className={styles.eyebrow}>Персональный трек</span>
          <h1>{song.title}</h1>
          {song.order.recipientName && <p>Создан специально для {song.order.recipientName}</p>}
        </div>
        <SharedTrackPlayer
          title={song.title}
          audioUrl={song.audioUrl}
          duration={song.duration}
        />
        <p className={styles.watermark}>
          Сделано в SongCraft. Такой же трек можно подарить близкому человеку за несколько минут.
        </p>
        <a className={styles.cta} href={`https://t.me/${BOT_USERNAME()}?start=gift_share_${song.shareToken}`}>
          Создать свой трек
        </a>
      </section>
    </main>
  );
}
