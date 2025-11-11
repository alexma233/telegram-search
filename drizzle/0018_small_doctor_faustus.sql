ALTER TABLE "joined_chats" DROP CONSTRAINT "joined_chats_chat_id_unique";--> statement-breakpoint
CREATE INDEX "chat_messages_owner_user_id_index" ON "chat_messages" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_chat_id_unique_index" ON "joined_chats" USING btree ("platform","chat_id");--> statement-breakpoint
CREATE INDEX "joined_chats_owner_user_id_index" ON "joined_chats" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "photos_owner_user_id_index" ON "photos" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "recent_sent_stickers_owner_user_id_index" ON "recent_sent_stickers" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "sticker_packs_owner_user_id_index" ON "sticker_packs" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "stickers_owner_user_id_index" ON "stickers" USING btree ("owner_user_id");