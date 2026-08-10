import { NextResponse } from 'next/server';
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error('Please define the REDIS_URL environment variable inside .env.local or Vercel settings.');
}

const redis = new Redis(redisUrl);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const room = url.searchParams.get('room');

    if (!room) {
      return NextResponse.json({ devices: [], messages: [] });
    }

    const deviceKeys = await redis.keys(`room_dev:${room}:*`);
    const devices = [];
    const now = Date.now();

    for (const key of deviceKeys) {
      const data = await redis.get(key);
      if (data) {
        const device = JSON.parse(data);
        if (now - device.updatedAt > 30000) {
          await redis.del(key);
        } else {
          devices.push(device);
        }
      }
    }

    const messagesKey = `room_msgs:${room}`;
    const rawMessages = await redis.get(messagesKey);
    const messages = rawMessages ? JSON.parse(rawMessages) : [];

    devices.sort((a, b) => b.updatedAt - a.updatedAt);

    return NextResponse.json({ devices, messages });
  } catch (e) {
    console.error('Redis GET Error:', e);
    return NextResponse.json({ error: 'Redis connection failed' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, name, type, room, status, action, content, contentType, attachments, targetId } = body;

    if (!id || !room) {
      return NextResponse.json({ error: 'Missing id or room' }, { status: 400 });
    }

    const devKey = `room_dev:${room}:${id}`;
    const msgsKey = `room_msgs:${room}`;

    const existingData = await redis.get(devKey);
    let currentStatus = status || 'pending';
    let isOwner = false;

    if (existingData) {
      const parsed = JSON.parse(existingData);
      currentStatus = parsed.status;
      isOwner = parsed.isOwner === true; // 保留房主标记
    } else {
      const keys = await redis.keys(`room_dev:${room}:*`);
      if (keys.length === 0) {
        // 第一个进房间的设备 = 房主，自动 approved
        currentStatus = 'approved';
        isOwner = true;
      }
    }

    const deviceData = {
      id,
      name: name || '未知设备',
      type: type || 'desktop',
      status: currentStatus,
      isOwner,
      updatedAt: Date.now(),
    };
    await redis.set(devKey, JSON.stringify(deviceData), 'EX', 45);

    if (action === 'approve' || action === 'reject') {
      if (targetId) {
        const targetKey = `room_dev:${room}:${targetId}`;
        const targetData = await redis.get(targetKey);
        if (targetData) {
          const targetParsed = JSON.parse(targetData);
          targetParsed.status = action === 'approve' ? 'approved' : 'rejected';
          await redis.set(targetKey, JSON.stringify(targetParsed), 'EX', 45);
        }
      }
    }

    if (action === 'message' && (content || (Array.isArray(attachments) && attachments.length > 0))) {
      const rawMsgs = await redis.get(msgsKey);
      let messages = rawMsgs ? JSON.parse(rawMsgs) : [];

      const newMsg: Record<string, any> = {
        id: Math.random().toString(36).substring(2, 9),
        senderId: id,
        senderName: name || '设备',
        content: content || '',
        contentType: contentType || 'text',
        timestamp: Date.now(),
      };
      if (Array.isArray(attachments) && attachments.length > 0) {
        newMsg.attachments = attachments;
      }

      messages.push(newMsg);
      if (messages.length > 50) {
        messages = messages.slice(-50);
      }

      await redis.set(msgsKey, JSON.stringify(messages), 'EX', 86400);
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Redis POST Error:', e);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}