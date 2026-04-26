import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';

export interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export interface UpcomingElection {
  state: string;
  date: string;
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private apiUrl = 'http://localhost:3000/api';
  
  // New: Channel to trigger messages from the dashboard
  private messageTrigger = new Subject<string>();
  messageTrigger$ = this.messageTrigger.asObservable();

  constructor(private http: HttpClient) { }

  sendMessage(message: string, history: ChatMessage[]): Observable<{ response: string }> {
    return this.http.post<{ response: string }>(`${this.apiUrl}/chat`, { message, history });
  }

  getUpcomingElections(): Observable<UpcomingElection[]> {
    return this.http.get<UpcomingElection[]>(`${this.apiUrl}/upcoming-elections`);
  }

  triggerMessage(text: string) {
    this.messageTrigger.next(text);
  }
}
