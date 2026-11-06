import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export type FileKind = 'pdf' | 'txt' | 'docx' | 'image';

export interface IFile {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  conversationId: Types.ObjectId | null;
  originalName: string;
  storageName: string;
  mimeType: string;
  kind: FileKind;
  size: number;
  extractedText: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const fileSchema = new Schema<IFile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', default: null, index: true },
    originalName: { type: String, required: true, maxlength: 255 },
    storageName: { type: String, required: true, unique: true },
    mimeType: { type: String, required: true },
    kind: { type: String, enum: ['pdf', 'txt', 'docx', 'image'], required: true },
    size: { type: Number, required: true },
    extractedText: { type: String, default: null, select: false },
  },
  { timestamps: true },
);

export type FileDoc = HydratedDocument<IFile>;
export const FileModel = model<IFile>('File', fileSchema);

export function serializeFile(f: IFile) {
  return {
    id: f._id.toString(),
    name: f.originalName,
    mimeType: f.mimeType,
    kind: f.kind,
    size: f.size,
    createdAt: f.createdAt,
  };
}
